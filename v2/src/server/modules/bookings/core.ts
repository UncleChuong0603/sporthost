import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, ne, or, isNull, sql, asc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { bookingsInClubhost as bookings, bookingParticipantsInClubhost as people, membersInClubhost as members, gameSessionsInClubhost as sessions, clubsInClubhost as clubs, auditLogsInClubhost as audit, paymentProofsInClubhost as proofs } from "@/server/db/schema";
import { getConfig } from "@/server/config";
import { guestToken, digest } from "@/server/compatibility/guest-capability";
import { AppError } from "@/server/errors";
import { localNow, registrationOpen } from "@/domain/session-policy";
import type { Gender } from "@/domain/catalog";

export type Game = typeof sessions.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Club = typeof clubs.$inferSelect;
export type Member = typeof members.$inferSelect;
export type PartyPerson = { position: number; memberId: number | null; name: string; gender: Gender; level: string; feeAmount: number };
export const paymentSnapshot = (club: Club) => ({ qr_key: club.qrKey, bank_name: club.bankName, account_holder: club.accountHolder, account_number: club.accountNumber, payment_note: club.paymentNote });
export function memberFee(game: Pick<Game, "fixedFee" | "guestFee" | "fixedFeeMale" | "fixedFeeFemale" | "guestFeeMale" | "guestFeeFemale">, member: Pick<Member, "kind" | "gender">) {
  const kind = member.kind === "fixed" ? "fixed" : "guest";
  const override = member.gender === "male" ? (kind === "fixed" ? game.fixedFeeMale : game.guestFeeMale) : member.gender === "female" ? (kind === "fixed" ? game.fixedFeeFemale : game.guestFeeFemale) : null;
  return override ?? (kind === "fixed" ? game.fixedFee : game.guestFee);
}
export function bookedPolicy(booking: Booking | null, game: Game): Record<string, unknown> {
  const value = booking?.policySnapshot ? JSON.parse(booking.policySnapshot) : null;
  return value && Object.keys(value).length ? value : { cancellation_deadline: game.cancellationDeadline || game.startsAt, cancellation_policy: game.cancellationPolicy, fee_mode: game.feeMode, no_show_policy: game.noShowPolicy, monthly_policy: game.monthlyPolicy };
}
export async function auditChange(db: NodePgDatabase, clubId: number | null, hostId: number | null, action: string, before: unknown, after: unknown, reason = "") {
  await db.insert(audit).values({ clubId, hostId, action, details: JSON.stringify({ before, after, reason }), createdAt: new Date().toISOString() });
}
export async function seatCounts(db: NodePgDatabase, gameId: number, excludeId?: number) {
  const gender = sql<string>`coalesce(${people.gender}, ${bookings.genderAtBooking})`;
  const rows = await db.select({ gender, count: sql<number>`count(*)::int` }).from(bookings).leftJoin(people, eq(people.bookingId, bookings.id)).where(and(eq(bookings.sessionId, gameId), eq(bookings.status, "confirmed"), or(isNull(people.id), ne(people.attendanceStatus, "NO_SHOW")), excludeId ? ne(bookings.id, excludeId) : undefined)).groupBy(gender);
  return Object.fromEntries(rows.map(row => [row.gender, Number(row.count)])) as Record<string, number>;
}
export async function canFit(db: NodePgDatabase, game: Game, genders: string[], excludeId?: number) {
  const counts = await seatCounts(db, game.id, excludeId);
  if (Object.values(counts).reduce((a, b) => a + b, 0) + genders.length > game.capacity) return false;
  if (genders.includes("unspecified") && (game.capacityMale !== null || game.capacityFemale !== null)) return false;
  for (const gender of ["male", "female"] as const) {
    const quota = gender === "male" ? game.capacityMale : game.capacityFemale;
    if (quota !== null && (counts[gender] || 0) + genders.filter(g => g === gender).length > quota) return false;
  }
  return true;
}
export async function participants(db: NodePgDatabase, bookingId: number) { return db.select().from(people).where(eq(people.bookingId, bookingId)).orderBy(asc(people.position)); }
export async function createBooking(db: NodePgDatabase, game: Game, club: Club, member: Member, status: string, party?: PartyPerson[], channel = "direct") {
  const nonce = randomBytes(32).toString("base64url"); const raw = guestToken(nonce, getConfig().SECRET_KEY);
  const expires = new Date(Math.max(Date.now(), new Date(game.startsAt + ":00+07:00").valueOf()) + 180 * 86400000).toISOString();
  const accepted = party || [{ position: 0, memberId: member.id, name: member.name, gender: member.gender as Gender, level: member.level, feeAmount: memberFee(game, member) }];
  const [booking] = await db.insert(bookings).values({ sessionId: game.id, memberId: member.id, status, paid: false, attended: false, feeAmount: accepted.reduce((sum, person) => sum + person.feeAmount, 0), accessKey: "", tokenNonce: nonce, tokenDigest: digest(raw), tokenExpiresAt: expires, tokenRevoked: false, channel, qrKey: club.qrKey, genderAtBooking: member.gender, policySnapshot: JSON.stringify(bookedPolicy(null, game)), paymentSnapshot: JSON.stringify(paymentSnapshot(club)), payerMode: "GROUP" }).returning();
  await db.insert(people).values(accepted.map(person => ({ ...person, bookingId: booking.id })));
  return { booking, key: raw };
}
export async function allowGuestChange(db: NodePgDatabase, booking: Booking, game: Game, editing = true) {
  if (game.attendanceLocked || ["PLAY_FINISHED", "SETTLED"].includes(game.lifecycleStatus)) throw new AppError(409, "Buổi đã kết thúc hoặc đã phát hành tiền. Vui lòng liên hệ host.");
  const deadline = String(bookedPolicy(booking, game).cancellation_deadline || game.cancellationDeadline || game.startsAt);
  if (game.isCancelled || localNow() >= deadline) throw new AppError(400, "Đã qua hạn thay đổi đăng ký. Vui lòng liên hệ host.");
  const party = await participants(db, booking.id);
  const [proof] = editing ? await db.select({ id: proofs.id }).from(proofs).where(eq(proofs.bookingId, booking.id)).limit(1) : [];
  if (booking.attended || party.some(p => p.attendanceStatus !== "NOT_MARKED") || (editing && (booking.paid || proof))) throw new AppError(409, "Đăng ký đã có điểm danh hoặc giao dịch. Liên hệ host để đối soát.");
}
export async function promoteWaitlist(db: NodePgDatabase, game: Game, excludeId?: number) {
  if (!registrationOpen(game)) return;
  const queue = await db.select({ booking: bookings, member: members }).from(bookings).innerJoin(members, eq(bookings.memberId, members.id)).where(and(eq(bookings.sessionId, game.id), eq(bookings.status, "waitlist"))).orderBy(asc(bookings.id)).for("update");
  for (const { booking, member } of queue) {
    if (booking.id === excludeId || (game.approvalMode === "MANUAL_APPROVE" && member.kind === "guest")) continue;
    const party = await participants(db, booking.id);
    if (await canFit(db, game, party.length ? party.map(p => p.gender) : [booking.genderAtBooking])) { await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, booking.id)); break; }
  }
}
