import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { notifications } from "@/server/db/notification-schema";
import { memberAccountLinks as links } from "@/server/db/member-schema";
import { bookingsInClubhost as bookings, hostsInClubhost as accounts, gameSessionsInClubhost as sessions, monthlyDuesInClubhost as dues, membersInClubhost as members, paymentProofsInClubhost as proofs } from "@/server/db/schema";

export const notificationTitles = {
  invited: "Bạn có lời mời tham gia buổi chơi", confirmed: "Đăng ký đã được xác nhận", waitlist: "Đăng ký đang trong danh sách chờ", cancelled: "Host đã hủy đăng ký của bạn", rejected: "Host đã từ chối đăng ký", promoted: "Đã có chỗ cho bạn từ danh sách chờ", session_changed: "Thông tin buổi chơi đã thay đổi", session_cancelled: "Buổi chơi đã bị hủy", proof_confirmed: "Host đã đối soát biên nhận của bạn", proof_rejected: "Biên nhận cần được kiểm tra lại", rsvp_reminder: "Nhắc bạn trả lời lời mời tham gia", payment_reminder: "Nhắc bạn kiểm tra khoản còn cần đóng",
} as const;
export type NotificationKind = keyof typeof notificationTitles;

export async function bookingNotification(db: NodePgDatabase, bookingId: number, eventKey: string, kind: NotificationKind, at = new Date()) {
  const recipients = await db.select({ accountId: links.accountId, memberId: bookings.memberId, clubId: sessions.clubId }).from(bookings).innerJoin(sessions, eq(sessions.id, bookings.sessionId)).innerJoin(links, eq(links.memberId, bookings.memberId)).innerJoin(accounts, and(eq(accounts.id, links.accountId), eq(accounts.emailVerified, true))).where(eq(bookings.id, bookingId));
  if (recipients.length) await db.insert(notifications).values(recipients.map(recipient => ({ ...recipient, bookingId, eventKey, kind, title: notificationTitles[kind], createdAt: at.toISOString() }))).onConflictDoNothing({ target: [notifications.accountId, notifications.eventKey] });
}
export async function sessionNotification(db: NodePgDatabase, gameId: number, eventKey: string, kind: "session_changed" | "session_cancelled") {
  const rows = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.sessionId, gameId), inArray(bookings.status, ["invited", "pending", "confirmed", "waitlist"])));
  for (const row of rows) await bookingNotification(db, row.id, `${eventKey}:${row.id}`, kind);
}
export async function proofNotification(db: NodePgDatabase, proofId: number, status: "confirmed" | "rejected") {
  const [proof] = await db.select().from(proofs).where(eq(proofs.id, proofId));
  if (!proof) return;
  const kind = status === "confirmed" ? "proof_confirmed" : "proof_rejected";
  if (proof.bookingId !== null) return bookingNotification(db, proof.bookingId, `proof:${proofId}:${status}`, kind);
  const recipients = await db.select({ accountId: links.accountId, memberId: dues.memberId, clubId: members.clubId }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).innerJoin(links, eq(links.memberId, dues.memberId)).innerJoin(accounts, and(eq(accounts.id, links.accountId), eq(accounts.emailVerified, true))).where(eq(dues.id, proof.dueId!));
  if (recipients.length) await db.insert(notifications).values(recipients.map(recipient => ({ ...recipient, dueId: proof.dueId, eventKey: `proof:${proofId}:${status}`, kind, title: notificationTitles[kind], createdAt: new Date().toISOString() }))).onConflictDoNothing({ target: [notifications.accountId, notifications.eventKey] });
}
