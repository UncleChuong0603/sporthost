import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { getPool, closePool, transaction } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { deleteClub, retryDeletedClubMedia } from "@/server/modules/clubs/deletion";
import * as database from "@/server/db/client";
import * as storage from "@/server/infrastructure/storage";
import { createSession } from "@/server/modules/scheduling/service";
import { joinGuest } from "@/server/modules/bookings/guest";
import { attendanceCommand, lifecycle } from "@/server/modules/attendance/service";
import { financeView } from "@/server/modules/finance/queries";
import { issueCharges, hostRecordMoney } from "@/server/modules/finance/service";
import { financeLedger, sessionCsv, ledgerCsv, csv } from "@/server/modules/finance/ledger";
import { createPlatformEntry, editPlatformEntry, platformLedger, extendTrial } from "@/server/modules/platform/service";
import { localNow } from "@/domain/session-policy";

const run = randomBytes(5).toString("hex"), key = () => randomBytes(16).toString("hex");
let owner: number, other: number, admin: number, club: number, preserved: number, gameId: number, bookingId: number;
const ownedGuestAuditIds: number[] = [];
beforeAll(async () => {
  installTestEnv(); owner = (await signup(`v2-delete-${run}@example.com`, "delete-password-123")).id;
  other = (await signup(`v2-delete-out-${run}@example.com`, "delete-password-123")).id;
  admin = (await signup(`v2-delete-admin-${run}@example.com`, "delete-password-123")).id;
  await getPool().query("UPDATE clubhost.hosts SET is_platform_admin=true WHERE id=$1", [admin]);
  club = (await createClub(owner, { name: "Delete explicitly " + run })).id;
  preserved = (await createClub(other, { name: "Keep independent " + run })).id;
  const result = await createSession(owner, club, { title: "Issued money", capacity: 2, guest_fee: 70000, starts_at: localNow(new Date(Date.now() + 86400000)), approval_mode: "AUTO_APPROVE" });
  gameId = result.gameId!;
  const publicId = (await getPool().query("SELECT public_id FROM clubhost.game_sessions WHERE id=$1", [gameId])).rows[0].public_id;
  const booking = await joinGuest(publicId, { name: "=untrusted spreadsheet", phone: "0908888222" }); bookingId = booking.bookingId!;
  const participant = (await getPool().query("SELECT id FROM clubhost.booking_participants WHERE booking_id=$1", [bookingId])).rows[0].id;
  await lifecycle(owner, gameId, "start"); await attendanceCommand(owner, gameId, participant, "check_in", 0); await lifecycle(owner, gameId, "finish");
  await issueCharges(owner, gameId, (await financeView(owner, gameId)).draftHash);
});
afterAll(async () => {
  for (const [host, id, name] of [[owner, club, "Delete explicitly " + run], [other, preserved, "Keep independent " + run]] as const) {
    if (id && (await getPool().query("SELECT id FROM clubhost.clubs WHERE id=$1", [id])).rowCount) await deleteClub(host, id, name);
  }
  await transaction(async client => {
    if (ownedGuestAuditIds.length) await client.query("DELETE FROM clubhost.audit_logs WHERE id=ANY($1::int[])", [ownedGuestAuditIds]);
    await client.query("DELETE FROM clubhost.platform_ledger_entries WHERE created_by=$1", [admin]);
    await client.query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])", [[owner, other, admin]]);
    await client.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [[owner, other, admin]]);
  }); await closePool();
});
describe("platform ledger stays independent from club money", () => {
  it("requires persisted admin role, serializes retries and preserves audited edit versions", async () => {
    const values = { entryDate: "2026-11-01", direction: "INCOME", category: "Phí phần mềm", amount: 99000, note: "Ghi nội bộ" }; const request = key();
    await expect(platformLedger(owner)).rejects.toMatchObject({ status: 403 });
    await expect(createPlatformEntry(owner, values, request)).rejects.toMatchObject({ status: 403 });
    const records = await Promise.all([createPlatformEntry(admin, values, request), createPlatformEntry(admin, values, request)]);
    expect(records[0].id).toBe(records[1].id);
    await editPlatformEntry(admin, records[0].id, { ...values, amount: 90000 }, 0, "Sửa ghi nhầm");
    await expect(editPlatformEntry(admin, records[0].id, values, 0, "Trùng phiên bản")).rejects.toMatchObject({ status: 409 });
    const data = await platformLedger(admin, "2026-11"); expect(data.entries.find(entry => entry.id === records[0].id)?.amount).toBe(90000);
    const log = data.logs.find(log => log.action === "Sửa sổ nền tảng" && JSON.parse(log.details).before.id === records[0].id)!;
    expect(JSON.parse(log.details)).toMatchObject({ before: { amount: 99000 }, after: { amount: 90000 }, reason: "Sửa ghi nhầm" });
    expect((await financeView(owner, gameId)).totals).toMatchObject({ amount: 70000, net: 0, outstanding: 70000 });
    await expect(extendTrial(owner, club, 30)).rejects.toMatchObject({ status: 403 });
    await extendTrial(admin, club, 30);
    expect((await getPool().query("SELECT trial_ends_at FROM clubhost.clubs WHERE id=$1", [club])).rows[0].trial_ends_at).toBeTruthy();
  });
  it("reconciles received net once in the club ledger and preserves original CSV columns safely", async () => {
    await hostRecordMoney(owner, gameId, bookingId, { amount: 30000, kind: "RECEIVED", source: "CASH", requestKey: key() });
    const ledger = await financeLedger(owner, club);
    expect(ledger.totals).toEqual({ received: 30000, outstanding: 40000, expenses: 0 });
    const file = await sessionCsv(owner, gameId); expect(file).toContain('"Họ tên","Số điện thoại","Giới tính"'); expect(file).toContain("'=untrusted spreadsheet");
    expect(file).toContain("70000"); expect(await ledgerCsv(owner, club)).toContain("30000");
    expect(csv([[" \t=SUM(A1)", "+formula", "@x", -10000]])).toContain('"\' \t=SUM(A1)","\'+formula","\'@x","-10000"');
    await expect(sessionCsv(other, gameId)).rejects.toMatchObject({ status: 404 });
    await expect(financeLedger(other, club)).rejects.toMatchObject({ status: 404 });
  });
});
describe("explicit club deletion is atomic and retains the account/audit trail", () => {
  it("retains records on transaction failure and journals post-commit file cleanup for safe retry", async () => {
    const name = "Delete rollback " + run; const temporary = (await createClub(owner, { name })).id;
    const assetKey = `clubs/${temporary}/proof/${"a".repeat(32)}.png`;
    await getPool().query("INSERT INTO clubhost.stored_assets(club_id,key,kind,sha256,size,created_at) VALUES($1,$2,'proof',$3,12,$4)", [temporary, assetKey, "0".repeat(64), new Date().toISOString()]);
    const remove = vi.spyOn(storage, "deleteImage").mockRejectedValue(new Error("Synthetic volume unavailable"));
    const original = database.transaction;
    const fault = vi.spyOn(database, "transaction").mockImplementationOnce(work => original(async client => { await work(client); throw new Error("Synthetic deletion failure"); }));
    try {
      await expect(deleteClub(owner, temporary, name)).rejects.toThrow("Synthetic deletion failure");
      expect(remove).not.toHaveBeenCalled();
      expect((await getPool().query("SELECT id FROM clubhost.clubs WHERE id=$1", [temporary])).rowCount).toBe(1);
    } finally { fault.mockRestore(); }
    try {
      expect((await deleteClub(owner, temporary, name)).cleanupPending).toBe(1);
      const job = (await getPool().query("SELECT id,details FROM clubhost.audit_logs WHERE action='Dọn ảnh CLB đã xóa' AND details::json->>'club_id'=$1", [String(temporary)])).rows[0];
      expect(JSON.parse(job.details)).toMatchObject({ status: "pending", asset_keys: [assetKey] });
      remove.mockResolvedValue(undefined);
      await expect(retryDeletedClubMedia(other, job.id)).rejects.toMatchObject({ status: 404 });
      expect(await retryDeletedClubMedia(owner, job.id)).toEqual({ cleanupPending: 0 });
      expect(JSON.parse((await getPool().query("SELECT details FROM clubhost.audit_logs WHERE id=$1", [job.id])).rows[0].details).status).toBe("complete");
    } finally { remove.mockRestore(); }
  });
  it("requires ownership and exact typed name, removes self-referencing money safely and keeps other clubs", async () => {
    await expect(deleteClub(other, club, "Delete explicitly " + run)).rejects.toMatchObject({ status: 404 });
    await expect(deleteClub(owner, club, "wrong name")).rejects.toMatchObject({ status: 400 });
    const refund = await hostRecordMoney(owner, gameId, bookingId, { amount: 5000, kind: "REFUND_RECORDED", source: "CASH", requestKey: key(), reason: "Refund" });
    await hostRecordMoney(owner, gameId, bookingId, { amount: 5000, kind: "REVERSAL", source: "CASH", reversesId: refund.id, requestKey: key(), reason: "Correction" });
    ownedGuestAuditIds.push(...(await getPool().query("SELECT id FROM clubhost.audit_logs WHERE club_id=$1 AND host_id IS NULL", [club])).rows.map(row => row.id));
    await deleteClub(owner, club, "Delete explicitly " + run);
    for (const table of ["bookings", "charge_batches", "money_movements", "expenses"]) expect((await getPool().query(`SELECT count(*)::int n FROM clubhost.${table} WHERE session_id=$1`, [gameId])).rows[0].n).toBe(0);
    expect((await getPool().query("SELECT id FROM clubhost.hosts WHERE id=$1", [owner])).rowCount).toBe(1);
    expect((await getPool().query("SELECT id FROM clubhost.clubs WHERE id=$1", [preserved])).rowCount).toBe(1);
    expect((await getPool().query("SELECT club_id FROM clubhost.audit_logs WHERE host_id=$1 AND action='Xóa CLB'", [owner])).rows[0].club_id).toBeNull();
  });
});
