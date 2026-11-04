import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { installTestEnv } from "./environment";
import { getPool, closePool, transaction } from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub, sessionDefaults } from "@/server/modules/clubs/service";
import { createSession } from "@/server/modules/scheduling/service";
import { joinGuest } from "@/server/modules/bookings/guest";
import { attendanceCommand, lifecycle } from "@/server/modules/attendance/service";
import { issueCharges, hostRecordMoney, closeSession, adjustCharge, guestPayer, saveExpense, draftAdjustment } from "@/server/modules/finance/service";
import { financeView } from "@/server/modules/finance/queries";
import { localNow } from "@/domain/session-policy";
import { fingerprint, encode, type BillingSnapshot } from "@/domain/billing";
import legacyBilling from "../fixtures/legacy-billing.json";
import { guestBooking } from "@/server/modules/bookings/queries";
import { getDb } from "@/server/db/client";
import { draft } from "@/server/modules/finance/queries";
import { gameActor } from "@/server/modules/scheduling/service";
import * as database from "@/server/db/client";


const run = randomBytes(5).toString("hex"); const key = () => randomBytes(16).toString("hex");
let host: number, outsider: number, checker: number, club: number, phoneCounter = 0;
beforeAll(async () => {
  installTestEnv(); host = (await signup(`v2-bill-${run}@example.com`, "billing-password-123")).id;
  outsider = (await signup(`v2-bill-out-${run}@example.com`, "billing-password-123")).id;
  checker = (await signup(`v2-bill-check-${run}@example.com`, "billing-password-123")).id;
  club = (await createClub(host, { name: "Billing isolation" })).id;
  await getPool().query("INSERT INTO clubhost.club_access(club_id,host_id,role,permissions) VALUES($1,$2,'custom','[\"check_in\"]')", [club, checker]);
});
afterAll(async () => {
  if (club) await transaction(async client => {
    const gameIds = "SELECT id FROM clubhost.game_sessions WHERE club_id=$1";
    const batchIds = `SELECT id FROM clubhost.charge_batches WHERE session_id IN (${gameIds})`;
    await client.query(`DELETE FROM clubhost.money_movements WHERE session_id IN (${gameIds})`, [club]);
    await client.query(`DELETE FROM clubhost.charge_adjustments WHERE batch_id IN (${batchIds})`, [club]);
    await client.query(`DELETE FROM clubhost.charges WHERE batch_id IN (${batchIds})`, [club]);
    await client.query(`DELETE FROM clubhost.charge_batches WHERE session_id IN (${gameIds})`, [club]);
    await client.query(`DELETE FROM clubhost.expenses WHERE session_id IN (${gameIds})`, [club]);
    await client.query(`DELETE FROM clubhost.booking_participants WHERE booking_id IN (SELECT id FROM clubhost.bookings WHERE session_id IN (${gameIds}))`, [club]);
    await client.query(`DELETE FROM clubhost.bookings WHERE session_id IN (${gameIds})`, [club]);
    await client.query("DELETE FROM clubhost.game_sessions WHERE club_id=$1", [club]);
    await client.query("DELETE FROM clubhost.monthly_dues WHERE member_id IN (SELECT id FROM clubhost.members WHERE club_id=$1)", [club]);
    for (const table of ["members", "audit_logs", "club_access"]) await client.query(`DELETE FROM clubhost.${table} WHERE club_id=$1`, [club]);
    await client.query("DELETE FROM clubhost.clubs WHERE id=$1", [club]);
    await client.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [[host, outsider, checker]]);
  });
  await closePool();
});
async function setup(size = 1, extra: Record<string, unknown> = {}, finish = true) {
  const result = await createSession(host, club, { title: "Finance test", starts_at: localNow(new Date(Date.now() + 7 * 86400000)), capacity: 20, guest_fee: 70000, approval_mode: "AUTO_APPROVE", ...extra });
  const gameId = result.gameId!;
  const publicId = (await getPool().query("SELECT public_id FROM clubhost.game_sessions WHERE id=$1", [gameId])).rows[0].public_id;
  const booking = await joinGuest(publicId, { name: "Người trả", phone: `091${7000000 + phoneCounter++}`, gender: "male", companions: Array.from({ length: size - 1 }, (_, index) => ({ name: `Bạn ${index}`, gender: "female" })) });
  const participants = (await getPool().query("SELECT * FROM clubhost.booking_participants WHERE booking_id=$1 ORDER BY id", [booking.bookingId])).rows;
  if (finish) {
    await lifecycle(host, gameId, "start");
    for (const person of participants) await attendanceCommand(host, gameId, person.id, "check_in", 0);
    await lifecycle(host, gameId, "finish");
  }
  return { gameId, bookingId: booking.bookingId!, guestKey: booking.key!, participants };
}
const issue = async (gameId: number) => issueCharges(host, gameId, (await financeView(host, gameId)).draftHash);
const receipt = (gameId: number, bookingId: number, amount: number, extra: Record<string, unknown> = {}) => hostRecordMoney(host, gameId, bookingId, { amount, kind: "RECEIVED", source: "BANK_TRANSFER", requestKey: key(), ...extra });

describe("immutable billing and append-only integer-VND money", () => {
  it("preserves captured Python billing bytes, balances and receipt row compatibility without a Python process", async () => {
    const { gameId, bookingId, guestKey } = await setup(3, { fee_mode: "COST_SHARING" });
    await saveExpense(host, gameId, null, { title: "Tiền sân có dấu", amount: 100001, category: "COURT" });
    const preview = await financeView(host, gameId);
    const normalize = (snapshot: BillingSnapshot) => ({
      ...snapshot,
      people: snapshot.people.map((person, index) => ({ ...person, participant_id: index + 1, booking_id: 1, arrived_at: person.arrived_at ? "<recorded>" : null, left_at: person.left_at ? "<recorded>" : null })),
      expenses: snapshot.expenses.map((expense, index) => ({ ...expense, id: index + 1, created_by: expense.created_by === null ? null : 1, created_at: expense.created_at ? "<recorded>" : null })),
      advances: snapshot.advances.map(advance => ({ ...advance, booking_id: 1 })),
    });
    expect(normalize(preview.calculation)).toEqual(normalize(legacyBilling.calculation as BillingSnapshot));
    expect(encode(legacyBilling.calculation)).toBe(legacyBilling.canonical_json);
    expect(fingerprint(legacyBilling.calculation)).toBe(legacyBilling.fingerprint);
    await issue(gameId); await receipt(gameId, bookingId, 60000);
    const native = await financeView(host, gameId);
    expect(native.totals).toEqual(legacyBilling.after_receipt.totals);
    expect((await guestBooking(guestKey)).feeAmount).toBe(legacyBilling.after_receipt.booking_fee);
    expect(native.payers.map(({ payer_participant_id, name, amount, received, refunded, net, outstanding, credit, status }) => ({ booking_id: 1, payer_participant_id, name, amount, received, refunded, net, outstanding, credit, status })))
      .toEqual(legacyBilling.after_receipt.payers.map(row => ({ ...row, booking_id: 1 })));
    const currentDraft = await draft(getDb(), (await gameActor(getDb(), host, gameId, "manage_finance")).game);
    expect(normalize(currentDraft)).toEqual(normalize(legacyBilling.calculation as BillingSnapshot));
    // Insert the exact captured legacy receipt shape into this guarded disposable DB.
    // Repeated delivery keeps the original database uniqueness/idempotency contract.
    const old = legacyBilling.after_legacy_receipt.legacy_receipt;
    const requestKey = key();
    const insert = `INSERT INTO clubhost.money_movements(session_id,booking_id,payer_participant_id,amount,kind,source,reference,reason,confirmed_by,occurred_at,created_at,request_key,proof_id,reverses_id)
      VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(session_id,request_key) DO NOTHING`;
    const values = [gameId,bookingId,old.amount,old.kind,old.source,old.reference,old.reason,host,old.occurred_at,old.created_at,requestKey,old.proof_id,old.reverses_id];
    await getPool().query(insert,values); await getPool().query(insert,values);
    const resumed = await financeView(host,gameId);
    expect(resumed.totals).toEqual(legacyBilling.after_legacy_receipt.totals);
    expect(resumed.totals).toMatchObject({ net: 70001, outstanding: 30000 });
    expect(resumed.payers[0].movements).toHaveLength(2);
  });
  it("allocates exact remainder, rejects stale draft and issues once under a race", async () => {
    const { gameId } = await setup(3, { fee_mode: "COST_SHARING" });
    await saveExpense(host, gameId, null, { title: "Tiền sân", amount: 100001, category: "COURT" });
    const before = await financeView(host, gameId);
    expect(before.calculation.people.map(person => person.amount)).toEqual([33334, 33334, 33333]);
    await saveExpense(host, gameId, null, { title: "CLB bù", amount: 10000, allocated: false });
    await expect(issueCharges(host, gameId, before.draftHash)).rejects.toMatchObject({ status: 409 });
    const preview = await financeView(host, gameId);
    const results = await Promise.all([issueCharges(host, gameId, preview.draftHash), issueCharges(host, gameId, preview.draftHash)]);
    expect(results[0].id).toBe(results[1].id);
    expect((await issueCharges(host, gameId, "old retry hash")).id).toBe(results[0].id);
    expect((await financeView(host, gameId)).calculation).toMatchObject({ excluded_expenses: 10000, total_due: 100001 });
    await expect(saveExpense(host, gameId, null, { title: "Too late", amount: 1 })).rejects.toMatchObject({ status: 409 });
  });
  it("serializes duplicate money, partial receipts, overpayment, refunds and one reversal", async () => {
    const { gameId, bookingId } = await setup(); await issue(gameId);
    const requestKey = key();
    const entries = await Promise.all([receipt(gameId, bookingId, 30000, { requestKey }), receipt(gameId, bookingId, 30000, { requestKey })]);
    expect(entries[0].id).toBe(entries[1].id);
    await expect(receipt(gameId, bookingId, 31000, { requestKey })).rejects.toMatchObject({ status: 409 });
    expect((await financeView(host, gameId)).totals).toMatchObject({ net: 30000, outstanding: 40000 });
    await receipt(gameId, bookingId, 50000, { source: "CASH" });
    expect((await financeView(host, gameId)).totals.credit).toBe(10000);
    const refund = await receipt(gameId, bookingId, 10000, { kind: "REFUND_RECORDED", reason: "Hoàn thừa" });
    await expect(receipt(gameId, bookingId, 999999, { kind: "REFUND_RECORDED", reason: "Quá số dư" })).rejects.toMatchObject({ status: 409 });
    await expect(receipt(gameId, bookingId, 1, { kind: "REFUND_RECORDED" })).rejects.toMatchObject({ status: 400 });
    const reversals = await Promise.allSettled([receipt(gameId, bookingId, 10000, { kind: "REVERSAL", reversesId: refund.id, reason: "Ghi nhầm hoàn" }), receipt(gameId, bookingId, 10000, { kind: "REVERSAL", reversesId: refund.id, reason: "Trùng" })]);
    expect(reversals.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await financeView(host, gameId)).totals).toMatchObject({ received: 80000, net: 80000, refunded: 0, credit: 10000 });
  });
  it("commits distinct simultaneous receipts and admits only one refund beyond the combined remaining net", async () => {
    const { gameId, bookingId } = await setup(); await issue(gameId);
    await Promise.all([receipt(gameId, bookingId, 30000), receipt(gameId, bookingId, 30000)]);
    expect((await financeView(host, gameId)).totals.net).toBe(60000);
    const refunds = await Promise.allSettled([receipt(gameId, bookingId, 50000, { kind: "REFUND_RECORDED", reason: "One" }), receipt(gameId, bookingId, 50000, { kind: "REFUND_RECORDED", reason: "Two" })]);
    expect(refunds.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await financeView(host, gameId)).totals).toMatchObject({ net: 10000, received: 60000, refunded: 50000, outstanding: 60000 });
  });
  it("rolls back money, audit and flags together on failure, then safely retries the same request", async () => {
    const { gameId, bookingId } = await setup(); await issue(gameId); const requestKey = key();
    const count = (await getPool().query("SELECT count(*)::int n FROM clubhost.audit_logs WHERE club_id=$1", [club])).rows[0].n;
    const original = database.transaction;
    const fault = vi.spyOn(database, "transaction").mockImplementationOnce(work => original(async client => { await work(client); throw new Error("Synthetic money commit failure"); }));
    try { await expect(receipt(gameId, bookingId, 70000, { requestKey })).rejects.toThrow("Synthetic money commit failure"); }
    finally { fault.mockRestore(); }
    const after = await financeView(host, gameId); expect(after.totals.net).toBe(0);
    expect((await getPool().query("SELECT paid FROM clubhost.bookings WHERE id=$1", [bookingId])).rows[0].paid).toBe(false);
    expect((await getPool().query("SELECT count(*)::int n FROM clubhost.audit_logs WHERE club_id=$1", [club])).rows[0].n).toBe(count);
    await receipt(gameId, bookingId, 70000, { requestKey }); await receipt(gameId, bookingId, 70000, { requestKey });
    expect((await financeView(host, gameId)).payers[0].movements).toHaveLength(1);
  });
  it("serializes charge adjustment versions while preserving the issued snapshot", async () => {
    const { gameId } = await setup(); const batch = await issue(gameId);
    const chargeId = (await financeView(host, gameId)).payers[0].people[0].charge_id;
    const changes = await Promise.allSettled([adjustCharge(host, gameId, { chargeId, amount: -1000, version: 1, reason: "One", requestKey: key() }), adjustCharge(host, gameId, { chargeId, amount: -2000, version: 1, reason: "Two", requestKey: key() })]);
    expect(changes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const view = await financeView(host, gameId); expect(view.batch).toMatchObject({ snapshot: batch.snapshot, version: 2 });
    expect([68000, 69000]).toContain(view.totals.amount); expect(view.payers[0].people[0].original_amount).toBe(70000);
  });
  it("keeps split obligations scoped to the booking and cannot change payer after issue", async () => {
    const { gameId, bookingId, guestKey, participants } = await setup(3);
    await guestPayer(guestKey, "SPLIT"); await issue(gameId);
    await expect(receipt(gameId, bookingId, 70000)).rejects.toMatchObject({ status: 400 });
    await receipt(gameId, bookingId, 70000, { payerParticipantId: participants[0].id });
    const other = await setup();
    await expect(receipt(gameId, bookingId, 1, { payerParticipantId: other.participants[0].id })).rejects.toMatchObject({ status: 400 });
    await expect(receipt(gameId, other.bookingId, 1)).rejects.toMatchObject({ status: 404 });
    await expect(guestPayer(guestKey, "GROUP")).rejects.toMatchObject({ status: 409 });
    expect((await financeView(host, gameId)).totals).toMatchObject({ amount: 210000, outstanding: 140000 });
  });
  it("settles with outstanding debt and adjusts by version without rewriting original charges", async () => {
    const { gameId, bookingId } = await setup(2); const batch = await issue(gameId);
    await Promise.all([closeSession(host, gameId), closeSession(host, gameId)]);
    expect((await financeView(host, gameId)).totals.outstanding).toBe(140000);
    await receipt(gameId, bookingId, 100000, { source: "CASH" });
    const charge = (await financeView(host, gameId)).payers[0].people[0];
    const raw = { chargeId: charge.charge_id, amount: -10000, version: 1, reason: "Host giảm phí", requestKey: key() };
    await adjustCharge(host, gameId, raw); await adjustCharge(host, gameId, raw);
    await expect(adjustCharge(host, gameId, { ...raw, requestKey: key() })).rejects.toMatchObject({ status: 409 });
    await expect(adjustCharge(host, gameId, { ...raw, amount: -999999, version: 2, requestKey: key() })).rejects.toMatchObject({ status: 400 });
    const view = await financeView(host, gameId);
    expect(view.batch).toMatchObject({ snapshot: batch.snapshot, version: 2 }); expect(view.totals.outstanding).toBe(30000);
    expect(view.payers[0].people[0]).toMatchObject({ original_amount: 70000, amount: 60000 });
    expect((await getPool().query("SELECT count(*)::int n FROM clubhost.audit_logs WHERE club_id=$1 AND action='Chốt sổ buổi đánh' AND details::json->'after'->>'batch_id'=$2", [club, String(batch.id)])).rows[0].n).toBe(1);
  });
  it("freezes bank/QR together and imports only explicit legacy receipts once", async () => {
    const { gameId, bookingId } = await setup();
    await getPool().query("UPDATE clubhost.clubs SET bank_name='Bank A',qr_key='private/qr-a.png' WHERE id=$1", [club]);
    await getPool().query("UPDATE clubhost.bookings SET paid=true,payment_status='confirmed' WHERE id=$1", [bookingId]);
    const batch = await issue(gameId); await issueCharges(host, gameId, "retry");
    await getPool().query("UPDATE clubhost.clubs SET bank_name='Bank B',qr_key='private/qr-b.png' WHERE id=$1", [club]);
    const view = await financeView(host, gameId);
    expect(view.calculation.payment).toMatchObject({ bank_name: "Bank A", qr_key: "private/qr-a.png" });
    expect(view.totals.net).toBe(70000); expect(view.payers[0].movements).toHaveLength(1);
    expect(view.batch?.snapshot).toBe(batch.snapshot);
  });
  it("respects accepted no-show/monthly policies, waivers, and exact zero-billable loss", async () => {
    const { gameId, bookingId, participants } = await setup(3, { fee_mode: "COST_SHARING", monthly_policy: "EXEMPT_PAID" });
    const row = (await getPool().query("SELECT member_id FROM clubhost.bookings WHERE id=$1", [bookingId])).rows[0];
    await getPool().query("UPDATE clubhost.members SET kind='fixed' WHERE id=$1", [row.member_id]);
    await getPool().query("INSERT INTO clubhost.monthly_dues(member_id,period,amount,paid) SELECT $1,left(starts_at,7),300000,true FROM clubhost.game_sessions WHERE id=$2", [row.member_id, gameId]);
    await attendanceCommand(host, gameId, participants[2].id, "no_show", 1, "Vắng");
    await saveExpense(host, gameId, null, { title: "Sân", amount: 100001 });
    expect((await financeView(host, gameId)).calculation.people.map(person => person.amount)).toEqual([0, 100001, 0]);
    await draftAdjustment(host, gameId, participants[1].id, { exempt: true, discount: 0, reason: "Host mời" });
    const view = await financeView(host, gameId);
    expect(view.calculation).toMatchObject({ billable_count: 0, unallocated_cost: 100001, total_due: 0 });
    await issue(gameId);
  });
  it("requires finished, fully marked attendance and applies tenant and capability boundaries", async () => {
    const { gameId } = await setup(1, {}, false);
    await expect(issue(gameId)).rejects.toMatchObject({ status: 409 });
    await lifecycle(host, gameId, "start"); await lifecycle(host, gameId, "finish");
    await expect(issue(gameId)).rejects.toMatchObject({ status: 409 });
    await expect(financeView(outsider, gameId)).rejects.toMatchObject({ status: 404 });
    await expect(financeView(checker, gameId)).rejects.toMatchObject({ status: 403 });
    await expect(issueCharges(checker, gameId, "bad")).rejects.toMatchObject({ status: 403 });
    await expect(sessionDefaults(checker, club)).rejects.toMatchObject({ status: 403 });
  });
});
