import "server-only";
import { and, eq, desc } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { storedAssetsInClubhost as assets, paymentProofsInClubhost as proofs, bookingsInClubhost as bookings, monthlyDuesInClubhost as dues, membersInClubhost as members, clubsInClubhost as clubs, gameSessionsInClubhost as sessions, moneyMovementsInClubhost as movements } from "@/server/db/schema";
import { sanitizeImage, putImage, deleteImage, readImage } from "@/server/infrastructure/storage";
import { requireClubAccess } from "@/server/access/permissions";
import { guestContext } from "@/server/modules/bookings/guest";
import { gameActor } from "@/server/modules/scheduling/service";
import { auditChange, paymentSnapshot } from "@/server/modules/bookings/core";
import { dueContext, targetPayment, bankSchema } from "./club";
import { batchFor, balances } from "./queries";
import { recordMoney, scopedBooking } from "./service";
import { moneySchema } from "@/domain/session-policy";
import { AppError } from "@/server/errors";
import type { PlayerBookingAccess, PlayerDueAccess } from "@/server/modules/member-portal/access";

const now = () => new Date().toISOString();
// A DB failure, including COMMIT failure, removes the newly written file. Historical assets stay immutable.
async function uploadTransaction<T>(upload: File, kind: "qr" | "proof", work: (db: NodePgDatabase, save: (clubId: number) => Promise<typeof assets.$inferSelect>) => Promise<T>) {
  let writtenKey: string | null = null;
  try {
    return await transaction(async client => {
      const db = drizzle(client);
      return work(db, async clubId => {
        if (writtenKey) throw new Error("One file per upload transaction");
        const clean = await sanitizeImage(upload, kind);
        writtenKey = await putImage(clean.data, clubId, kind);
        const [asset] = await db.insert(assets).values({ clubId, key: writtenKey, kind, sha256: clean.sha256, size: clean.data.length, createdAt: now() }).returning();
        return asset;
      });
    });
  } catch (error) {
    if (writtenKey) await deleteImage(writtenKey);
    throw error;
  }
}
export async function updateBankWithQr(hostId: number, clubId: number, raw: unknown, upload: File) {
  const parsed = bankSchema.safeParse(raw); if (!parsed.success) throw new AppError(400, "Kiểm tra thông tin tài khoản nhận tiền.");
  return uploadTransaction(upload, "qr", async (db, save) => {
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    const { club } = await requireClubAccess(db, hostId, clubId, "manage_finance");
    const asset = await save(clubId);
    await db.update(clubs).set({ ...parsed.data, qrKey: asset.key }).where(eq(clubs.id, clubId));
    await auditChange(db, clubId, hostId, "Cập nhật thông tin nhận tiền", paymentSnapshot(club), { ...parsed.data, qr_key: asset.key });
  });
}
export async function reportBookingProof(key: PlayerBookingAccess, upload: File, raw: { reportedAmount?: unknown; payerParticipantId?: number | null }) {
  return uploadTransaction(upload, "proof", async (db, save) => {
    const { booking, game, club } = await guestContext(db, key, true);
    const batch = await batchFor(db, game.id);
    if (game.isCancelled || booking.status !== "confirmed" || (!batch && (booking.paid || booking.paymentStatus === "refunded"))) throw new AppError(400, "Chỉ gửi biên nhận cho đăng ký đã xác nhận và chưa thanh toán.");
    if (!batch && game.feeMode === "COST_SHARING") throw new AppError(409, "Chờ host phát hành tiền sau khi chia đều trước khi báo chuyển.");
    if (!batch && (await db.select({ id: proofs.id }).from(proofs).where(and(eq(proofs.bookingId, booking.id), eq(proofs.status, "reported"))).limit(1)).length) throw new AppError(409, "Biên nhận đang chờ host đối chiếu.");
    let amount: number | null = null, payer: number | null = null;
    if (batch) {
      const parsed = moneySchema.safeParse(raw.reportedAmount);
      if (!parsed.success || !parsed.data) throw new AppError(400, "Cần số tiền đã báo chuyển.");
      amount = parsed.data; payer = raw.payerParticipantId ?? null;
      if (!(await balances(db, game.id, booking.id)).some(row => row.payer_participant_id === payer)) throw new AppError(400, "Người thanh toán không thuộc lượt đăng ký.");
    }
    const asset = await save(club.id);
    if ((await db.select({ id: proofs.id }).from(proofs).innerJoin(assets, eq(assets.id, proofs.assetId)).where(and(eq(proofs.bookingId, booking.id), eq(assets.sha256, asset.sha256))).limit(1)).length) throw new AppError(409, "Ảnh này đã được gửi cho lượt đăng ký. Không cần tải lại.");
    const [proof] = await db.insert(proofs).values({ bookingId: booking.id, assetId: asset.id, reportedAmount: amount, payerParticipantId: payer, status: "reported", note: "", createdAt: now() }).returning({ id: proofs.id });
    if (!booking.paid) await db.update(bookings).set({ paymentStatus: "reported" }).where(eq(bookings.id, booking.id));
    await auditChange(db, club.id, null, "Nhận biên nhận", null, { booking_id: booking.id, proof_id: proof.id }); return proof;
  });
}
export async function reportDueProof(key: PlayerDueAccess, upload: File) {
  return uploadTransaction(upload, "proof", async (db, save) => {
    const { due, club } = await dueContext(db, key, true);
    if (due.paid || (await db.select({ id: proofs.id }).from(proofs).where(and(eq(proofs.dueId, due.id), eq(proofs.status, "reported"))).limit(1)).length) throw new AppError(409, "Khoản thu đã xử lý hoặc đang chờ duyệt.");
    const asset = await save(club.id);
    const [proof] = await db.insert(proofs).values({ dueId: due.id, assetId: asset.id, status: "reported", note: "", createdAt: now() }).returning({ id: proofs.id });
    await db.update(dues).set({ paymentStatus: "reported" }).where(eq(dues.id, due.id));
    await auditChange(db, club.id, null, "Nhận biên nhận phí tháng", null, { due_id: due.id, proof_id: proof.id }); return proof;
  });
}
const reviewInput = z.object({ action: z.enum(["confirm", "reject"]), note: z.string().trim().max(300).default(""), receivedAmount: z.unknown().optional(), occurredAt: z.string().datetime({ offset: true }).optional() });
export async function reviewProof(hostId: number, proofId: number, raw: unknown) {
  const parsed = reviewInput.safeParse(raw); if (!parsed.success) throw new AppError(400, "Kiểm tra thao tác và thông tin đối soát.");
  const value = parsed.data;
  return transaction(async client => {
    const db = drizzle(client);
    const [initial] = await db.select({ proof: proofs, asset: assets }).from(proofs).innerJoin(assets, eq(assets.id, proofs.assetId)).where(eq(proofs.id, proofId));
    if (!initial) throw new AppError(404, "Không tìm thấy biên nhận.");
    await requireClubAccess(db, hostId, initial.asset.clubId, "manage_finance");
    if (initial.proof.bookingId !== null) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, initial.proof.bookingId));
      const { game } = await gameActor(db, hostId, booking.sessionId, "manage_finance", true);
      const current = await scopedBooking(db, game.id, booking.id);
      const [proof] = await db.select().from(proofs).where(eq(proofs.id, proofId)).for("update");
      const batch = await batchFor(db, game.id);
      if (batch) {
        if (proof.status !== "reported") {
          const [entry] = await db.select().from(movements).where(eq(movements.proofId, proof.id));
          if (proof.status === "confirmed" && value.action === "confirm" && entry && String(entry.amount) === String(value.receivedAmount)) return initial.asset.clubId;
          throw new AppError(409, "Biên nhận này đã được xử lý.");
        }
        if (value.action === "confirm") await recordMoney(db, game, current, hostId, { amount: value.receivedAmount, kind: "RECEIVED", source: "BANK_TRANSFER", requestKey: `proof-review-${proof.id}`, payerParticipantId: proof.payerParticipantId, reason: value.note, occurredAt: value.occurredAt, proofId: proof.id });
      } else {
        if (proof.status !== "reported" || current.paid) throw new AppError(409, "Biên nhận này đã được xử lý.");
        if (game.feeMode === "COST_SHARING" && value.action === "confirm") throw new AppError(409, "Cần phát hành tiền trước khi đối soát chia đều.");
        await db.update(bookings).set({ paid: value.action === "confirm", paymentStatus: value.action === "confirm" ? "confirmed" : "rejected" }).where(eq(bookings.id, current.id));
      }
    } else if (initial.proof.dueId !== null) {
      const [due] = await db.select().from(dues).where(eq(dues.id, initial.proof.dueId)).for("update");
      const [proof] = await db.select().from(proofs).where(eq(proofs.id, proofId)).for("update");
      if (!due || proof.status !== "reported" || due.paid) throw new AppError(409, "Biên nhận này đã được xử lý.");
      await db.update(dues).set({ paid: value.action === "confirm", paymentStatus: value.action === "confirm" ? "confirmed" : "rejected" }).where(eq(dues.id, due.id));
    } else throw new AppError(404, "Không tìm thấy khoản thu.");
    const status = value.action === "confirm" ? "confirmed" : "rejected";
    await db.update(proofs).set({ status, reviewedBy: hostId, reviewedAt: now(), note: value.note }).where(eq(proofs.id, proofId));
    await auditChange(db, initial.asset.clubId, hostId, "Đối soát biên nhận", { status: "reported" }, { proof_id: proofId, status, received_amount: value.action === "confirm" ? value.receivedAmount ?? null : null }, value.note);
    return initial.asset.clubId;
  });
}
export async function proofImage(hostId: number, proofId: number) {
  const db = getDb(); const [record] = await db.select({ asset: assets }).from(proofs).innerJoin(assets, eq(assets.id, proofs.assetId)).where(eq(proofs.id, proofId));
  if (!record) throw new AppError(404, "Không tìm thấy biên nhận.");
  await requireClubAccess(db, hostId, record.asset.clubId, "manage_finance");
  if (!record.asset.size) throw new AppError(410, "Ảnh biên nhận đã hết thời hạn lưu trữ.");
  return readImage(record.asset.key);
}
export async function bookingQr(key: PlayerBookingAccess) {
  const db = getDb(); const { booking, game, club } = await guestContext(db, key);
  const batch = await batchFor(db, game.id); const payment = batch ? JSON.parse(batch.snapshot).payment : targetPayment(booking, club);
  if (!payment.qr_key) throw new AppError(404, "Chưa có ảnh QR."); return readImage(payment.qr_key);
}
export async function dueQr(key: PlayerDueAccess) {
  const { due, club } = await dueContext(getDb(), key); const payment = targetPayment(due, club);
  if (!payment.qr_key) throw new AppError(404, "Chưa có ảnh QR."); return readImage(payment.qr_key);
}
export async function hostQr(hostId: number, clubId: number) {
  const { club } = await requireClubAccess(getDb(), hostId, clubId, "manage_finance");
  if (!club.qrKey) throw new AppError(404, "Chưa có ảnh QR."); return readImage(club.qrKey);
}
export async function listProofs(hostId: number, clubId: number) {
  const db = getDb(); await requireClubAccess(db, hostId, clubId, "manage_finance");
  const records = await db.select({ proof: proofs }).from(proofs).innerJoin(assets, eq(assets.id, proofs.assetId)).where(and(eq(assets.clubId, clubId), eq(proofs.status, "reported"))).orderBy(desc(proofs.id));
  return Promise.all(records.map(async ({ proof }) => {
    if (proof.bookingId !== null) {
      const [row] = await db.select({ name: members.name, title: sessions.title, gameId: sessions.id }).from(bookings).innerJoin(members, eq(members.id, bookings.memberId)).innerJoin(sessions, eq(sessions.id, bookings.sessionId)).where(eq(bookings.id, proof.bookingId));
      return { id: proof.id, createdAt: proof.createdAt, reportedAmount: proof.reportedAmount, issued: !!await batchFor(db, row.gameId), ...row };
    }
    const [row] = await db.select({ name: members.name, period: dues.period }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).where(eq(dues.id, proof.dueId!));
    return { id: proof.id, createdAt: proof.createdAt, reportedAmount: null, issued: false, name: row.name, title: "Phí tháng " + row.period, gameId: null };
  }));
}
