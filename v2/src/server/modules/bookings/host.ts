import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { transaction } from "@/server/db/client";
import { bookingsInClubhost as bookings, membersInClubhost as members } from "@/server/db/schema";
import { gameActor, mutableAttendance } from "@/server/modules/scheduling/service";
import { createBooking, participants, canFit, promoteWaitlist, auditChange } from "./core";
import { registrationOpen } from "@/domain/session-policy";
import { guestToken, digest } from "@/server/compatibility/guest-capability";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";

export async function bookingDecision(hostId: number, gameId: number, bookingId: number, action: string, reason = "") {
  if (!["approve", "waitlist", "cancel", "reject"].includes(action)) throw new AppError(400, "Thao tác không hợp lệ.");
  return transaction(async client => {
    const db = drizzle(client); const { game, club } = await gameActor(db, hostId, gameId, "manage_bookings", true); mutableAttendance(game);
    if (game.lifecycleStatus === "PLAY_FINISHED") throw new AppError(409, "Mở lại buổi chơi trước khi sửa danh sách.");
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.sessionId, gameId)));
    if (!booking) throw new AppError(404, "Không tìm thấy lượt đăng ký.");
    const party = await participants(db, bookingId);
    let status = ({ approve: "confirmed", waitlist: "waitlist", cancel: "cancelled", reject: "rejected" } as Record<string, string>)[action];
    if (action === "approve") {
      if (!registrationOpen(game) && game.lifecycleStatus !== "IN_PROGRESS") throw new AppError(400, "Đã đóng đăng ký hoặc qua hạn nhận người.");
      if (booking.status !== "confirmed" && !await canFit(db, game, party.length ? party.map(p => p.gender) : [booking.genderAtBooking])) status = "waitlist";
    }
    await db.update(bookings).set({ status, decisionReason: reason.trim().slice(0, 500) }).where(eq(bookings.id, booking.id));
    if (booking.status === "confirmed" && status !== "confirmed") await promoteWaitlist(db, game, booking.id);
    await auditChange(db, club.id, hostId, "Cập nhật đăng ký", { status: booking.status }, { booking_id: booking.id, status }, reason.trim().slice(0, 500));
    return status;
  });
}
export async function addFixed(hostId: number, gameId: number, memberId: number) {
  return transaction(async client => {
    const db = drizzle(client); const { game, club } = await gameActor(db, hostId, gameId, "manage_bookings", true); mutableAttendance(game);
    if (!["OPEN", "IN_PROGRESS"].includes(game.lifecycleStatus)) throw new AppError(409, "Mở lại buổi chơi trước khi thêm người.");
    const [member] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.clubId, club.id), eq(members.kind, "fixed")));
    if (!member) throw new AppError(400, "Thông tin thành viên không hợp lệ.");
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.sessionId, gameId), eq(bookings.memberId, memberId)));
    if (booking?.status === "confirmed") return;
    const party = booking ? await participants(db, booking.id) : [];
    if (!await canFit(db, game, party.length ? party.map(p => p.gender) : [member.gender])) throw new AppError(409, "Không đủ chỗ cho cả nhóm.", "full");
    if (booking) await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, booking.id));
    else await createBooking(db, game, club, member, "confirmed");
    await auditChange(db, club.id, hostId, "Thêm thành viên vào buổi", null, { member_id: memberId, game_id: gameId });
  });
}
export async function changePrivateLink(hostId: number, gameId: number, bookingId: number, action: "rotate" | "revoke") {
  await transaction(async client => {
    const db = drizzle(client); const { game, club } = await gameActor(db, hostId, gameId, "manage_bookings", true);
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.sessionId, gameId)));
    if (!booking) throw new AppError(404, "Không tìm thấy lượt đăng ký.");
    if (action === "revoke") await db.update(bookings).set({ tokenRevoked: true }).where(eq(bookings.id, booking.id));
    else {
      const nonce = randomBytes(32).toString("base64url");
      await db.update(bookings).set({ tokenNonce: nonce, tokenDigest: digest(guestToken(nonce, getConfig().SECRET_KEY)), tokenRevoked: false, accessKey: "", legacyTokenDigest: null, tokenExpiresAt: new Date(Math.max(Date.now(), new Date(game.startsAt + ":00+07:00").valueOf()) + 180 * 86400000).toISOString() }).where(eq(bookings.id, booking.id));
    }
    await auditChange(db, club.id, hostId, action === "revoke" ? "Thu hồi liên kết riêng" : "Cấp lại liên kết riêng", null, { booking_id: bookingId });
  });
}
