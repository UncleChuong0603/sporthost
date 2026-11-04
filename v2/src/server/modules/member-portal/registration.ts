import "server-only";
import { and, eq, asc, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDb, transaction } from "@/server/db/client";
import { gameSessionsInClubhost as sessions, clubsInClubhost as clubs, membersInClubhost as members, bookingsInClubhost as bookings } from "@/server/db/schema";
import { memberAccountLinks as links } from "@/server/db/member-schema";
import { hostsInClubhost as accounts } from "@/server/db/schema";
import { requireLinkedMember } from "./access";
import { registrationOpen, guestOpen, localNow } from "@/domain/session-policy";
import { createBooking, canFit, auditChange, memberFee, seatCounts } from "@/server/modules/bookings/core";
import { AppError } from "@/server/errors";

// These are sessions in owner-approved clubs, never a public member directory.
export async function playerOpenSessions(accountId: number) {
  const now = localNow(), db = getDb();
  const rows = await db.select({ game: sessions, memberId: members.id, memberName: members.name, kind: members.kind, gender: members.gender, clubName: clubs.name, bookingId: bookings.id })
    .from(links).innerJoin(accounts, and(eq(accounts.id, links.accountId), eq(accounts.emailVerified, true)))
    .innerJoin(members, eq(members.id, links.memberId)).innerJoin(clubs, eq(clubs.id, members.clubId))
    .innerJoin(sessions, and(eq(sessions.clubId, clubs.id), gte(sessions.startsAt, now), eq(sessions.lifecycleStatus, "OPEN"), eq(sessions.isOpen, true), eq(sessions.isCancelled, false)))
    .leftJoin(bookings, and(eq(bookings.sessionId, sessions.id), eq(bookings.memberId, members.id)))
    .where(eq(links.accountId, accountId)).orderBy(asc(sessions.startsAt), asc(sessions.id), asc(members.id));
  const available = rows.filter(({ game, kind, bookingId }) => !bookingId && !game.attendanceLocked && registrationOpen(game, now) && (kind === "fixed" ? !game.rsvpDeadline || now <= game.rsvpDeadline : guestOpen(game, now)));
  return Promise.all(available.map(async ({ game, memberId, memberName, kind, gender, clubName }) => ({
    id: game.id, memberId, memberName, title: game.title, clubName, startsAt: game.startsAt, venue: game.venue,
    capacity: game.capacity, confirmed: Object.values(await seatCounts(db, game.id)).reduce((a,b) => a+b, 0),
    fee: game.feeMode === "COST_SHARING" ? null : memberFee(game, { kind, gender }),
    cancellationPolicy: game.cancellationPolicy, participationConditions: game.participationConditions,
    approval: kind === "fixed" || game.approvalMode === "AUTO_APPROVE" ? "Tự động xác nhận nếu còn chỗ" : "Host duyệt đăng ký",
  })));
}

export async function registerPlayer(accountId: number, gameId: number, memberId: number) {
  if (![accountId, gameId, memberId].every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647)) throw new AppError(404, "Không tìm thấy buổi chơi.");
  return transaction(async client => {
    const db = drizzle(client);
    await requireLinkedMember(db, accountId, memberId);
    const [game] = await db.select().from(sessions).where(eq(sessions.id, gameId)).for("update");
    if (!game) throw new AppError(404, "Không tìm thấy buổi chơi.");
    const [club] = await db.select().from(clubs).where(eq(clubs.id, game.clubId)).for("update");
    await requireLinkedMember(db, accountId, memberId, true);
    const [member] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.clubId, game.clubId)));
    if (!member) throw new AppError(404, "Không tìm thấy buổi chơi.");
    const [existing] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.sessionId, gameId), eq(bookings.memberId, memberId)));
    if (existing) return existing.id; // Retry opens the original registration, never reserves another seat.
    const now = localNow();
    if (!registrationOpen(game, now) || game.attendanceLocked || (member.kind === "fixed" ? !!game.rsvpDeadline && now > game.rsvpDeadline : !guestOpen(game, now))) throw new AppError(409, "Đã qua hạn hoặc đóng đăng ký. Vui lòng liên hệ host.");
    const fits = await canFit(db, game, [member.gender]);
    const status = !fits ? "waitlist" : member.kind === "fixed" || game.approvalMode === "AUTO_APPROVE" ? "confirmed" : "pending";
    const { booking } = await createBooking(db, game, club, member, status);
    await auditChange(db, club.id, accountId, "Thành viên đăng ký từ lịch CLB", null, { booking_id: booking.id, status });
    return booking.id;
  });
}
