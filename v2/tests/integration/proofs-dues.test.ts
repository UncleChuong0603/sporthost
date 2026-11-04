import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import sharp from "sharp";
import { installTestEnv } from "./environment";
import * as database from "@/server/db/client";
import { signup } from "@/server/auth/service";
import { createClub, sessionDefaults } from "@/server/modules/clubs/service";
import { saveMember } from "@/server/modules/members/service";
import { createSession } from "@/server/modules/scheduling/service";
import { joinGuest } from "@/server/modules/bookings/guest";
import { attendanceCommand, lifecycle } from "@/server/modules/attendance/service";
import { financeView } from "@/server/modules/finance/queries";
import { issueCharges } from "@/server/modules/finance/service";
import { updatePrices, bulkDues, listDues, toggleDue, duePage } from "@/server/modules/finance/club";
import { updateBankWithQr, reportBookingProof, reportDueProof, reviewProof, proofImage, bookingQr } from "@/server/modules/finance/proofs";
import { sanitizeImage } from "@/server/infrastructure/storage";
import { localNow } from "@/domain/session-policy";

const run = randomBytes(6).toString("hex"); let host: number, other: number, club: number, storage: string;
const pool = () => database.getPool();
async function image(color = "red") { return new File([await sharp({ create: { width: 16, height: 16, channels: 3, background: color } }).png().toBuffer()], "untrusted-file-name.png", { type: "image/png" }); }
const bank = { bankName: "Bank A", accountHolder: "Host A", accountNumber: "123456789", paymentNote: "Chuyen phi" };
beforeAll(async () => {
  installTestEnv(); storage = await mkdtemp(join(tmpdir(), "sporthost-v2-media-")); vi.stubEnv("STORAGE_ROOT", storage);
  host = (await signup(`v2-proof-${run}@example.com`, "proof-password-123")).id;
  other = (await signup(`v2-proof-other-${run}@example.com`, "proof-password-123")).id;
  club = (await createClub(host, { name: "Private media isolated" })).id;
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (club) await database.transaction(async client => {
    const games = "SELECT id FROM clubhost.game_sessions WHERE club_id=$1";
    const batch = `SELECT id FROM clubhost.charge_batches WHERE session_id IN (${games})`;
    const booking = `SELECT id FROM clubhost.bookings WHERE session_id IN (${games})`;
    await client.query(`DELETE FROM clubhost.money_movements WHERE session_id IN (${games})`, [club]);
    await client.query(`DELETE FROM clubhost.charge_adjustments WHERE batch_id IN (${batch})`, [club]);
    await client.query(`DELETE FROM clubhost.charges WHERE batch_id IN (${batch})`, [club]);
    await client.query(`DELETE FROM clubhost.charge_batches WHERE session_id IN (${games})`, [club]);
    await client.query("DELETE FROM clubhost.payment_proofs WHERE asset_id IN (SELECT id FROM clubhost.stored_assets WHERE club_id=$1)", [club]);
    await client.query(`DELETE FROM clubhost.booking_participants WHERE booking_id IN (${booking})`, [club]);
    await client.query(`DELETE FROM clubhost.bookings WHERE session_id IN (${games})`, [club]);
    await client.query("DELETE FROM clubhost.game_sessions WHERE club_id=$1", [club]);
    await client.query("DELETE FROM clubhost.monthly_dues WHERE member_id IN (SELECT id FROM clubhost.members WHERE club_id=$1)", [club]);
    for (const table of ["members", "stored_assets", "audit_logs"]) await client.query(`DELETE FROM clubhost.${table} WHERE club_id=$1`, [club]);
    await client.query("DELETE FROM clubhost.clubs WHERE id=$1", [club]);
    await client.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [[host, other]]);
  });
  await database.closePool();
  if (storage) {
    const inside = relative(tmpdir(), storage);
    if (inside.startsWith("sporthost-v2-media-") && !inside.includes("..") && !isAbsolute(inside)) await rm(storage, { recursive: true, force: true });
    else throw new Error("Refused test media cleanup outside its own temporary directory");
  }
});
async function game(phone: string, issued = true) {
  const created = await createSession(host, club, { title: "Proof report", capacity: 3, starts_at: localNow(new Date(Date.now() + 7 * 86400000)), guest_fee: 70000, approval_mode: "AUTO_APPROVE" });
  const gameId = created.gameId!;
  const publicId = (await pool().query("SELECT public_id FROM clubhost.game_sessions WHERE id=$1", [gameId])).rows[0].public_id;
  const booking = await joinGuest(publicId, { name: "Report guest", phone });
  if (issued) {
    const person = (await pool().query("SELECT id FROM clubhost.booking_participants WHERE booking_id=$1", [booking.bookingId])).rows[0];
    await lifecycle(host, gameId, "start"); await attendanceCommand(host, gameId, person.id, "check_in", 0); await lifecycle(host, gameId, "finish");
    await issueCharges(host, gameId, (await financeView(host, gameId)).draftHash);
  }
  return { gameId, bookingId: booking.bookingId!, key: booking.key! };
}
describe("private durable media and explicit proof review", () => {
  it("decodes/re-encodes accepted images and rejects spoofed MIME, SVG, oversize and pixel bombs", async () => {
    const png = await image(); const clean = await sanitizeImage(png, "proof");
    expect((await sharp(clean.data).metadata()).format).toBe("png");
    await expect(sanitizeImage(new File([await png.arrayBuffer()], "fake.jpg", { type: "image/jpeg" }), "proof")).rejects.toMatchObject({ status: 400 });
    await expect(sanitizeImage(new File(["<svg onload='bad()'></svg>"], "a.svg", { type: "image/svg+xml" }), "proof")).rejects.toMatchObject({ status: 400 });
    await expect(sanitizeImage(new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), "proof")).rejects.toMatchObject({ status: 400 });
    const bomb = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(sanitizeImage(new File([bomb], "pixels.png", { type: "image/png" }), "proof")).rejects.toMatchObject({ status: 400 });
  });
  it("reports screenshots without payment; manual partial receipt is idempotent and separate reports remain independent", async () => {
    const target = await game("0904567001");
    const first = await reportBookingProof(target.key, await image(), { reportedAmount: 70000 });
    const count = (await readdir(storage, { recursive: true })).filter(path => path.endsWith(".png")).length;
    await expect(reportBookingProof(target.key, await image(), { reportedAmount: 70000 })).rejects.toMatchObject({ status: 409 });
    expect((await readdir(storage, { recursive: true })).filter(path => path.endsWith(".png"))).toHaveLength(count);
    const second = await reportBookingProof(target.key, await image("blue"), { reportedAmount: 70000 });
    expect((await financeView(host, target.gameId)).totals.net).toBe(0);
    expect((await pool().query("SELECT paid,payment_status FROM clubhost.bookings WHERE id=$1", [target.bookingId])).rows[0]).toEqual({ paid: false, payment_status: "reported" });
    await expect(reviewProof(host, first.id, { action: "confirm" })).rejects.toMatchObject({ status: 400 });
    await Promise.all([reviewProof(host, first.id, { action: "confirm", receivedAmount: 30000 }), reviewProof(host, first.id, { action: "confirm", receivedAmount: 30000 })]);
    await expect(reviewProof(host, first.id, { action: "confirm", receivedAmount: 70000 })).rejects.toMatchObject({ status: 409 });
    await reviewProof(host, second.id, { action: "reject", note: "Không có tiền vào" });
    expect((await financeView(host, target.gameId)).totals).toMatchObject({ net: 30000, outstanding: 40000 });
    expect((await sharp(await proofImage(host, first.id)).metadata()).format).toBe("png");
    await expect(proofImage(other, first.id)).rejects.toMatchObject({ status: 404 });
    await expect(reviewProof(other, first.id, { action: "confirm", receivedAmount: 30000 })).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back the uploaded file and SQL rows if work fails before commit", async () => {
    const target = await game("0904567002");
    const before = (await readdir(storage, { recursive: true })).filter(path => path.endsWith(".png"));
    const original = database.transaction;
    const fault = vi.spyOn(database, "transaction").mockImplementationOnce(work => original(async client => { await work(client); throw new Error("Synthetic failure at commit boundary"); }));
    await expect(reportBookingProof(target.key, await image("green"), { reportedAmount: 70000 })).rejects.toThrow("Synthetic failure");
    fault.mockRestore();
    expect((await readdir(storage, { recursive: true })).filter(path => path.endsWith(".png"))).toEqual(before);
    expect((await pool().query("SELECT count(*)::int n FROM clubhost.payment_proofs WHERE booking_id=$1", [target.bookingId])).rows[0].n).toBe(0);
    expect((await pool().query("SELECT payment_status FROM clubhost.bookings WHERE id=$1", [target.bookingId])).rows[0].payment_status).toBe("unpaid");
  });
  it("keeps old bank text and image together after QR replacement and removal from new registrations", async () => {
    await updateBankWithQr(host, club, bank, await image("yellow"));
    const target = await game("0904567003", false); const original = await bookingQr(target.key);
    await updateBankWithQr(host, club, { ...bank, bankName: "Bank B" }, await image("black"));
    expect(await bookingQr(target.key)).toEqual(original);
    const saved = JSON.parse((await pool().query("SELECT payment_snapshot FROM clubhost.bookings WHERE id=$1", [target.bookingId])).rows[0].payment_snapshot);
    expect(saved.bank_name).toBe("Bank A");
  });
});
describe("monthly dues retain accounts, explicit payment and zero overrides", () => {
  it("generates once under a race, preserves an explicit zero price and leaves existing session prices unchanged", async () => {
    await saveMember(host, club, null, { name: "Male fixed", phone: "0904567111", kind: "fixed", gender: "male" });
    await saveMember(host, club, null, { name: "Female fixed", phone: "0904567222", kind: "fixed", gender: "female" });
    await updatePrices(host, club, "monthly", { amount: 300000, male: 0, female: 250000 });
    const created = await Promise.all([bulkDues(host, club, "2026-11"), bulkDues(host, club, "2026-11")]);
    expect(created.reduce((sum, value) => sum + value, 0)).toBe(2);
    const rows = await listDues(host, club, "2026-11"); expect(rows.map(row => row.amount).sort((a, b) => a - b)).toEqual([0, 250000]);
    await updatePrices(host, club, "fixed", { amount: 65000, male: 0, female: "" });
    expect(await sessionDefaults(host, club)).toMatchObject({ fixed_fee: 65000, fixed_fee_male: 0, fixed_fee_female: null });
    const target = rows.find(row => row.amount === 250000)!;
    const proof = await reportDueProof(target.key, await image("purple"));
    expect((await duePage(target.key)).paid).toBe(false);
    await expect(reportDueProof(target.key, await image("purple"))).rejects.toMatchObject({ status: 409 });
    await reviewProof(host, proof.id, { action: "confirm" }); expect((await duePage(target.key)).paid).toBe(true);
    await toggleDue(host, target.id); expect((await duePage(target.key)).paid).toBe(false);
    await expect(toggleDue(other, target.id)).rejects.toMatchObject({ status: 404 });
  });
});
