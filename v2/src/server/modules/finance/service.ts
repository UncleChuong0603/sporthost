import "server-only";
import { and, eq, asc } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { transaction } from "@/server/db/client";
import { bookingsInClubhost as bookings, bookingParticipantsInClubhost as people, gameSessionsInClubhost as sessions, chargeBatchesInClubhost as batches, chargesInClubhost as charges, moneyMovementsInClubhost as movements, chargeAdjustmentsInClubhost as adjustments, paymentProofsInClubhost as proofs, expensesInClubhost as expenses } from "@/server/db/schema";
import { gameActor, requireDraft } from "@/server/modules/scheduling/service";
import { auditChange, type Game, type Booking } from "@/server/modules/bookings/core";
import { guestContext } from "@/server/modules/bookings/guest";
import { batchFor, draft, balances, summary } from "./queries";
import { encode, fingerprint } from "@/domain/billing";
import { moneySchema } from "@/domain/session-policy";
import { AppError } from "@/server/errors";

const now = () => new Date().toISOString();
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new AppError(400, "Kiểm tra số tiền, lý do, mã thao tác và thông tin giao dịch.");
  return result.data;
}
const id = z.number().int().positive();
export async function scopedBooking(db: NodePgDatabase, gameId: number, bookingId: number) {
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.sessionId, gameId)));
  if (!booking) throw new AppError(404, "Không tìm thấy lượt đăng ký.");
  return booking;
}
export async function syncLegacy(db: NodePgDatabase, gameId: number, bookingId: number) {
  const rows = await balances(db, gameId, bookingId);
  const paid = rows.length > 0 && rows.every(row => !row.outstanding);
  await db.update(bookings).set({ paid, paymentStatus: paid ? "confirmed" : rows.some(row => row.net) ? "partial" : "unpaid" }).where(eq(bookings.id, bookingId));
}
export async function issueCharges(hostId: number, gameId: number, expected: string) {
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true);
    const existing = await batchFor(db, gameId); if (existing) return existing;
    await requireDraft(db, game);
    if (game.lifecycleStatus !== "PLAY_FINISHED") throw new AppError(409, "Kết thúc đánh và kiểm tra điểm danh trước khi phát hành tiền cần đóng.");
    const confirmed = await db.select({ id: bookings.id, person: people.id }).from(bookings).leftJoin(people, eq(people.bookingId, bookings.id)).where(and(eq(bookings.sessionId, gameId), eq(bookings.status, "confirmed")));
    if (confirmed.some(row => row.person === null)) throw new AppError(409, "Có đăng ký cũ chưa có danh sách người chơi. Cần kiểm tra trước khi phát hành.");
    const value = await draft(db, game);
    if (value.unmarked) throw new AppError(409, "Cần điểm danh có mặt/vắng cho tất cả người đã được nhận.");
    if (expected !== fingerprint(value)) throw new AppError(409, "Chi phí hoặc điểm danh đã thay đổi. Xem lại bản nháp trước khi phát hành.");
    const [batch] = await db.insert(batches).values({ sessionId: gameId, version: 1, snapshot: encode(value), issuedBy: hostId, issuedAt: now() }).returning();
    if (value.people.length) await db.insert(charges).values(value.people.map(person => ({ batchId: batch.id, bookingId: person.booking_id, participantId: person.participant_id, payerParticipantId: person.payer_participant_id, amount: person.amount, detail: encode(person) })));
    for (const advance of value.advances) {
      const booking = await scopedBooking(db, gameId, advance.booking_id);
      if (booking.payerMode !== "GROUP") throw new AppError(409, "Khoản đã thu trước phát hành cần giữ một người trả nhóm để đối soát số dư.");
      if (advance.amount) await db.insert(movements).values({ sessionId: gameId, bookingId: booking.id, amount: advance.amount, kind: "RECEIVED", source: "OTHER", reason: "Số dư đã thu legacy trước phát hành; chưa có giờ giao dịch gốc", reference: "", confirmedBy: hostId, requestKey: `legacy-opening-${booking.id}`, occurredAt: now(), createdAt: now() });
    }
    await db.update(sessions).set({ attendanceLocked: true }).where(eq(sessions.id, gameId));
    await auditChange(db, game.clubId, hostId, "Phát hành tiền cần đóng", null, { batch_id: batch.id, snapshot: value });
    for (const booking of await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.sessionId, gameId))) await syncLegacy(db, gameId, booking.id);
    return batch;
  });
}
const moneyInput = z.object({
  amount: moneySchema.refine(value => value > 0), kind: z.enum(["RECEIVED", "REFUND_RECORDED", "REVERSAL"]),
  source: z.enum(["CASH", "BANK_TRANSFER", "OTHER"]), requestKey: z.string().min(8).max(128),
  payerParticipantId: id.nullable().default(null), reason: z.string().max(500).default(""), reference: z.string().max(150).default(""),
  occurredAt: z.string().datetime({ offset: true }).optional(), proofId: id.nullable().default(null), reversesId: id.nullable().default(null),
});
// Callers must hold the session lock. Public inputs cannot supply proofId; only manual proof review can.
export async function recordMoney(db: NodePgDatabase, game: Game, booking: Booking, hostId: number, raw: unknown) {
  if (!await batchFor(db, game.id)) throw new AppError(409, "Cần phát hành tiền cần đóng trước khi ghi nhận khoản thu mới.");
  const value = parse(moneyInput, raw);
  if (value.kind !== "RECEIVED" && !value.reason.trim()) throw new AppError(400, "Cần lý do hoàn tiền / hoàn tác.");
  if (value.kind !== "REVERSAL" && value.reversesId !== null) throw new AppError(400, "Giao dịch gốc chỉ dùng khi hoàn tác.");
  let signed = value.kind === "REFUND_RECORDED" ? -value.amount : value.amount;
  if (value.kind === "REVERSAL") {
    const [original] = value.reversesId ? await db.select().from(movements).where(and(eq(movements.id, value.reversesId), eq(movements.sessionId, game.id), eq(movements.bookingId, booking.id))) : [];
    if (!original || original.kind === "REVERSAL" || original.payerParticipantId !== value.payerParticipantId || value.amount !== Math.abs(original.amount)) throw new AppError(400, "Giao dịch gốc, người trả hoặc số tiền hoàn tác chưa hợp lệ.");
    signed = -original.amount;
  }
  const [existing] = await db.select().from(movements).where(and(eq(movements.sessionId, game.id), eq(movements.requestKey, value.requestKey)));
  if (existing) {
    if (existing.bookingId !== booking.id || existing.payerParticipantId !== value.payerParticipantId || existing.amount !== signed || existing.kind !== value.kind || existing.source !== value.source || existing.proofId !== value.proofId || existing.reversesId !== value.reversesId) throw new AppError(409, "Mã thao tác đã dùng cho giao dịch khác. Tải lại trang.");
    return existing;
  }
  if (value.reversesId && (await db.select({ id: movements.id }).from(movements).where(eq(movements.reversesId, value.reversesId))).length) throw new AppError(409, "Giao dịch đã được hoàn tác.");
  const row = (await balances(db, game.id, booking.id)).find(row => row.payer_participant_id === value.payerParticipantId);
  if (!row) throw new AppError(400, "Chọn đúng người có nghĩa vụ thanh toán.");
  if (signed < 0 && row.net + signed < 0) throw new AppError(409, "Không thể hoàn/hoàn tác quá số thực nhận còn lại.");
  const [entry] = await db.insert(movements).values({ sessionId: game.id, bookingId: booking.id, payerParticipantId: value.payerParticipantId, amount: signed, kind: value.kind, source: value.source,
    reason: value.reason.trim(), reference: value.reference.trim(), requestKey: value.requestKey, confirmedBy: hostId, proofId: value.proofId, reversesId: value.reversesId, occurredAt: value.occurredAt ? new Date(value.occurredAt).toISOString() : now(), createdAt: now() }).returning();
  await auditChange(db, game.clubId, hostId, "Ghi nhận tiền thực tế", null, { id: entry.id, booking_id: booking.id, payer_participant_id: value.payerParticipantId, amount: signed, kind: value.kind, source: value.source, proof_id: value.proofId, reverses_id: value.reversesId }, value.reason.trim());
  await syncLegacy(db, game.id, booking.id); return entry;
}
export async function hostRecordMoney(hostId: number, gameId: number, bookingId: number, raw: Record<string, unknown>) {
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true);
    const booking = await scopedBooking(db, gameId, bookingId);
    return recordMoney(db, game, booking, hostId, { ...raw, proofId: null });
  });
}
export async function closeSession(hostId: number, gameId: number) {
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true);
    const batch = await batchFor(db, gameId);
    if (!batch || game.isCancelled) throw new AppError(409, "Cần phát hành cơ sở tính phí trước khi chốt sổ.");
    if (game.lifecycleStatus === "SETTLED") return batch;
    if (game.lifecycleStatus !== "PLAY_FINISHED") throw new AppError(409, "Cần kết thúc đánh trước khi chốt sổ.");
    const totals = summary(await balances(db, gameId)); const closedAt = now();
    await db.update(batches).set({ closedAt }).where(eq(batches.id, batch.id));
    await db.update(sessions).set({ lifecycleStatus: "SETTLED", isOpen: false, attendanceLocked: true }).where(eq(sessions.id, gameId));
    await auditChange(db, game.clubId, hostId, "Chốt sổ buổi đánh", { status: "PLAY_FINISHED" }, { status: "SETTLED", batch_id: batch.id, version: batch.version, totals });
    return { ...batch, closedAt };
  });
}
const adjustmentInput = z.object({ chargeId: id, amount: z.coerce.number().int().min(-100_000_000).max(100_000_000).refine(value => value !== 0), version: id, reason: z.string().trim().min(1).max(500), requestKey: z.string().min(8).max(128) });
export async function adjustCharge(hostId: number, gameId: number, raw: unknown) {
  const value = parse(adjustmentInput, raw);
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true);
    const batch = await batchFor(db, gameId); if (!batch) throw new AppError(409, "Chưa phát hành tiền cần đóng.");
    const [old] = await db.select().from(adjustments).where(and(eq(adjustments.batchId, batch.id), eq(adjustments.requestKey, value.requestKey)));
    if (old) {
      if (old.chargeId !== value.chargeId || old.amount !== value.amount || old.reason !== value.reason) throw new AppError(409, "Mã thao tác đã dùng.");
      return old;
    }
    if (batch.version !== value.version) throw new AppError(409, "Sổ vừa được thay đổi. Xem lại số tiền trước khi điều chỉnh.");
    const [charge] = await db.select().from(charges).where(and(eq(charges.id, value.chargeId), eq(charges.batchId, batch.id)));
    if (!charge) throw new AppError(404, "Không tìm thấy khoản phải thu.");
    const prior = await db.select().from(adjustments).where(eq(adjustments.chargeId, charge.id));
    const before = charge.amount + prior.reduce((sum, change) => sum + change.amount, 0);
    parse(moneySchema, before + value.amount);
    const version = batch.version + 1;
    await db.update(batches).set({ version }).where(eq(batches.id, batch.id));
    const [adjustment] = await db.insert(adjustments).values({ batchId: batch.id, chargeId: charge.id, amount: value.amount, version, reason: value.reason, createdBy: hostId, createdAt: now(), requestKey: value.requestKey }).returning();
    await auditChange(db, game.clubId, hostId, "Điều chỉnh khoản phải thu", { charge_id: charge.id, amount: before, version: value.version }, { amount: before + value.amount, version, adjustment_id: adjustment.id }, value.reason);
    await syncLegacy(db, gameId, charge.bookingId); return adjustment;
  });
}
export async function setPayerMode(db: NodePgDatabase, game: Game, booking: Booking, mode: string, hostId: number | null) {
  await requireDraft(db, game);
  if (!["GROUP", "SPLIT"].includes(mode)) throw new AppError(400, "Cách thanh toán không hợp lệ.");
  if (booking.paid && mode !== "GROUP") throw new AppError(409, "Đã thu trước phát hành. Giữ người trả cả nhóm để không phân bổ trùng.");
  if (mode === "SPLIT" && booking.payerMode !== "SPLIT" && (await db.select({ id: proofs.id }).from(proofs).where(and(eq(proofs.bookingId, booking.id), eq(proofs.status, "reported"))).limit(1)).length) throw new AppError(409, "Đang có biên nhận của nhóm. Đối soát / từ chối trước khi tách người trả.");
  await db.update(bookings).set({ payerMode: mode }).where(eq(bookings.id, booking.id));
  if (booking.payerMode !== mode) await auditChange(db, game.clubId, hostId, "Chọn người thanh toán", booking.payerMode, { booking_id: booking.id, mode });
}
export async function changePayer(hostId: number, gameId: number, bookingId: number, mode: string) {
  return transaction(async client => { const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true); await setPayerMode(db, game, await scopedBooking(db, gameId, bookingId), mode, hostId); });
}
export async function guestPayer(key: string, mode: string) {
  return transaction(async client => { const db = drizzle(client); const { game, booking } = await guestContext(db, key, true); if (booking.status !== "confirmed") throw new AppError(409, "Chỉ chọn thanh toán cho lượt đã được nhận."); await setPayerMode(db, game, booking, mode, null); });
}
export async function draftAdjustment(hostId: number, gameId: number, participantId: number, raw: unknown) {
  const value = parse(z.object({ exempt: z.boolean(), discount: moneySchema, reason: z.string().trim().min(1).max(500) }), raw);
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true); await requireDraft(db, game);
    const [record] = await db.select({ person: people }).from(people).innerJoin(bookings, eq(bookings.id, people.bookingId)).where(and(eq(people.id, participantId), eq(bookings.sessionId, gameId)));
    if (!record) throw new AppError(404, "Không tìm thấy người chơi.");
    const person = record.person;
    await db.update(people).set({ chargeExempt: value.exempt, feeDiscount: value.discount, adjustmentReason: value.reason }).where(eq(people.id, participantId));
    await auditChange(db, game.clubId, hostId, "Miễn giảm bản nháp", { exempt: person.chargeExempt, discount: person.feeDiscount, reason: person.adjustmentReason }, { participant_id: participantId, exempt: value.exempt, discount: value.discount }, value.reason);
  });
}
const expenseInput = z.object({ title: z.string().trim().min(1).max(150), amount: moneySchema, category: z.enum(["COURT", "EQUIPMENT", "OTHER"]).default("OTHER"), note: z.string().trim().max(500).default(""), allocated: z.boolean().default(true) });
export async function saveExpense(hostId: number, gameId: number, expenseId: number | null, raw: unknown) {
  const value = parse(expenseInput, raw);
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true); await requireDraft(db, game);
    const [before] = expenseId ? await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.sessionId, gameId))) : [];
    if (expenseId && !before) throw new AppError(404, "Không tìm thấy chi phí.");
    const [record] = expenseId ? await db.update(expenses).set(value).where(eq(expenses.id, expenseId)).returning() : await db.insert(expenses).values({ ...value, sessionId: gameId, createdBy: hostId, createdAt: now() }).returning();
    await auditChange(db, game.clubId, hostId, expenseId ? "Sửa chi phí" : "Thêm chi phí", before ?? null, record); return record;
  });
}
export async function deleteExpense(hostId: number, gameId: number, expenseId: number) {
  return transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_finance", true); await requireDraft(db, game);
    const [record] = await db.delete(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.sessionId, gameId))).returning();
    if (!record) throw new AppError(404, "Không tìm thấy chi phí.");
    await auditChange(db, game.clubId, hostId, "Xóa chi phí", record, null);
  });
}
