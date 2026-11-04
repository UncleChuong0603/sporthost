import "server-only";
import { and, eq, inArray, ne, asc } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { transaction } from "@/server/db/client";
import { gameSessionsInClubhost as sessions, bookingsInClubhost as bookings, bookingParticipantsInClubhost as people, membersInClubhost as members } from "@/server/db/schema";
import { gameActor, mutableAttendance } from "@/server/modules/scheduling/service";
import { participants, canFit, createBooking, auditChange, type Game, type Booking, type Person } from "@/server/modules/bookings/core";
import { normalizePhone, phoneAliases } from "@/domain/catalog";
import { requireClubAccess } from "@/server/access/permissions";
import { AppError } from "@/server/errors";

const snapshot = (p: Person) => ({ id: p.id, name: p.name, attendance_status: p.attendanceStatus, arrived_at: p.arrivedAt, left_at: p.leftAt, attendance_version: p.attendanceVersion });
export async function markAttendance(db: NodePgDatabase, game: Game, booking: Booking, person: Person, action: string, hostId: number, version: number, reason = "") {
  mutableAttendance(game);
  if (booking.status !== "confirmed") throw new AppError(409, "Chỉ điểm danh người đã được nhận vào buổi chơi.");
  if (!["check_in", "no_show", "check_out", "reset"].includes(action) || reason.length > 500) throw new AppError(400, "Thao tác hoặc lý do điểm danh chưa hợp lệ.");
  const desired = ({ check_in: "CHECKED_IN", no_show: "NO_SHOW", reset: "NOT_MARKED" } as Record<string, string>)[action];
  if ((action === "check_out" && person.leftAt) || (desired === person.attendanceStatus && (action !== "check_in" || !person.leftAt))) return;
  if (version !== person.attendanceVersion) throw new AppError(409, "Điểm danh vừa được host khác cập nhật. Vui lòng tải lại trang.", "stale_version");
  if (person.attendanceStatus === "NO_SHOW" && ["check_in", "reset"].includes(action) && !await canFit(db, game, [person.gender])) throw new AppError(409, "Chỗ đã được nhận bởi người khác. Vui lòng kiểm tra sức chứa.");
  const now = new Date().toISOString();
  let changes: Partial<Person>;
  if (action === "check_out") {
    if (person.attendanceStatus !== "CHECKED_IN") throw new AppError(400, "Cần điểm danh có mặt trước khi ghi nhận về sớm.");
    changes = { leftAt: now };
  } else if (action === "check_in") changes = { attendanceStatus: "CHECKED_IN", arrivedAt: person.arrivedAt || now, leftAt: null };
  else {
    if (person.attendanceStatus === "CHECKED_IN" && !reason.trim()) throw new AppError(400, "Vui lòng ghi lý do khi hoàn tác người đã có mặt.");
    changes = { attendanceStatus: desired, arrivedAt: null, leftAt: null };
  }
  const [updated] = await db.update(people).set({ ...changes, attendanceActorId: hostId, attendanceVersion: person.attendanceVersion + 1 }).where(eq(people.id, person.id)).returning();
  const party = await participants(db, booking.id);
  await db.update(bookings).set({ attended: party.every(p => p.attendanceStatus === "CHECKED_IN") }).where(eq(bookings.id, booking.id));
  await auditChange(db, game.clubId, hostId, "Điểm danh người chơi", snapshot(person), snapshot(updated), reason.trim());
}
export async function attendanceCommand(hostId: number, gameId: number, personId: number, action: string, version: number, reason = "") {
  await transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "check_in", true);
    const [row] = await db.select({ person: people, booking: bookings }).from(people).innerJoin(bookings, eq(people.bookingId, bookings.id)).where(and(eq(people.id, personId), eq(bookings.sessionId, gameId)));
    if (!row) throw new AppError(404, "Không tìm thấy người chơi.");
    await markAttendance(db, game, row.booking, row.person, action, hostId, version, reason);
  });
}
export async function lifecycle(hostId: number, gameId: number, action: string, reason = "") {
  await transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_session", true); mutableAttendance(game);
    const transitions: Record<string, [string, string]> = { start: ["OPEN", "IN_PROGRESS"], finish: ["IN_PROGRESS", "PLAY_FINISHED"], reopen: ["PLAY_FINISHED", "IN_PROGRESS"] };
    const pair = transitions[action]; if (!pair || reason.length > 500) throw new AppError(400, "Thao tác buổi chơi chưa hợp lệ.");
    if (game.lifecycleStatus === pair[1]) return;
    if (game.lifecycleStatus !== pair[0]) throw new AppError(409, "Trạng thái buổi chơi không phù hợp.");
    if (action === "reopen" && !reason.trim()) throw new AppError(400, "Vui lòng ghi lý do mở lại buổi chơi.");
    await db.update(sessions).set({ lifecycleStatus: pair[1], isOpen: false }).where(eq(sessions.id, gameId));
    await auditChange(db, game.clubId, hostId, "Đổi trạng thái buổi chơi", game.lifecycleStatus, pair[1], reason.trim());
  });
}
export async function walkIn(hostId: number, gameId: number, raw: { name: string; phone: string; gender?: string; level?: string }) {
  const parsed = z.object({ name: z.string().trim().min(1).max(100), phone: z.string(), gender: z.enum(["male", "female", "unspecified"]).default("unspecified"), level: z.string().trim().max(40).default("") }).safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Thông tin người đến sân chưa hợp lệ.");
  let phone: string; try { phone = normalizePhone(parsed.data.phone); } catch { throw new AppError(400, "Số điện thoại chưa hợp lệ."); }
  return transaction(async client => {
    const db = drizzle(client); const { game, club } = await gameActor(db, hostId, gameId, "manage_bookings", true);
    await requireClubAccess(db, hostId, club.id, "check_in"); mutableAttendance(game);
    if (!["OPEN", "IN_PROGRESS"].includes(game.lifecycleStatus)) throw new AppError(409, "Mở lại buổi chơi trước khi thêm người.");
    let [member] = await db.select().from(members).where(and(eq(members.clubId, club.id), inArray(members.phone, phoneAliases(phone)))).orderBy(asc(members.id));
    const [existing] = member ? await db.select().from(bookings).where(and(eq(bookings.sessionId, game.id), eq(bookings.memberId, member.id))) : [];
    if (existing) { if (existing.status !== "confirmed") throw new AppError(409, "Người chơi đã có lượt đăng ký. Hãy duyệt lượt hiện có."); return existing.id; }
    if (!await canFit(db, game, [member?.gender || parsed.data.gender])) throw new AppError(409, "Buổi chơi đã đủ chỗ.", "full");
    if (!member) [member] = await db.insert(members).values({ ...parsed.data, phone, clubId: club.id, kind: "guest" }).returning();
    const { booking } = await createBooking(db, game, club, member, "confirmed", undefined, "manual");
    const [person] = await participants(db, booking.id);
    await markAttendance(db, game, booking, person, "check_in", hostId, 0);
    await auditChange(db, club.id, hostId, "Thêm người đến trực tiếp", null, { booking_id: booking.id, name: member.name });
    return booking.id;
  });
}
export async function replacePerson(hostId: number, gameId: number, personId: number, raw: { name: string; gender: string; level: string; reason: string; version: number }) {
  const parsed = z.object({ name: z.string().trim().min(1).max(100), gender: z.enum(["male", "female", "unspecified"]), level: z.string().trim().max(40), reason: z.string().trim().min(1).max(500), version: z.number().int().nonnegative() }).safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Thông tin thay người và lý do chưa hợp lệ.");
  await transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_bookings", true); mutableAttendance(game);
    const [row] = await db.select({ person: people, booking: bookings }).from(people).innerJoin(bookings, eq(people.bookingId, bookings.id)).where(and(eq(people.id, personId), eq(bookings.sessionId, gameId)));
    if (!row) throw new AppError(404, "Không tìm thấy người chơi.");
    if (row.booking.status !== "confirmed" || row.person.attendanceVersion !== parsed.data.version) throw new AppError(409, "Thông tin vừa thay đổi. Vui lòng tải lại.");
    const party = await participants(db, row.booking.id);
    const genders = party.filter(p => p.id === personId || p.attendanceStatus !== "NO_SHOW").map(p => p.id === personId ? parsed.data.gender : p.gender);
    if (!await canFit(db, game, genders, row.booking.id)) throw new AppError(409, "Thay người vượt giới hạn chỗ hoặc giới tính.");
    const [updated] = await db.update(people).set({ name: parsed.data.name, gender: parsed.data.gender, level: parsed.data.level, memberId: null, attendanceStatus: "NOT_MARKED", arrivedAt: null, leftAt: null, attendanceActorId: hostId, attendanceVersion: row.person.attendanceVersion + 1 }).where(eq(people.id, personId)).returning();
    await db.update(bookings).set({ attended: false }).where(eq(bookings.id, row.booking.id));
    await auditChange(db, game.clubId, hostId, "Thay người tham gia", snapshot(row.person), snapshot(updated), parsed.data.reason);
  });
}
