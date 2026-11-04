import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, inArray, or, asc } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { transaction, getDb } from "@/server/db/client";
import { bookingsInClubhost as bookings, gameSessionsInClubhost as sessions, clubsInClubhost as clubs, membersInClubhost as members, bookingParticipantsInClubhost as people } from "@/server/db/schema";
import { guestOpen, registrationOpen, localNow } from "@/domain/session-policy";
import { normalizePhone, phoneAliases, type Gender } from "@/domain/catalog";
import { AppError } from "@/server/errors";
import { getConfig } from "@/server/config";
import { readSigned, signPayload, salts } from "@/server/compatibility/signed-payload";
import { digest, tokenValid } from "@/server/compatibility/guest-capability";
import { createBooking, memberFee, canFit, participants, auditChange, allowGuestChange, promoteWaitlist, type Game, type Member, type Booking, type PartyPerson } from "./core";
import { requireLinkedMember, type PlayerBookingAccess } from "@/server/modules/member-portal/access";

export type GuestOwner = { booking: number; key: string } | null;
const lookupSchema = z.object({ game: z.string().max(256), phone: z.string().max(22), version: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const personSchema = z.object({ name: z.string().trim().min(1).max(100), gender: z.enum(["male", "female", "unspecified"]).default("unspecified"), level: z.string().trim().max(40).default("") });
export const guestInputSchema = personSchema.extend({ phone: z.string().max(30), lookup_token: z.string().max(16384).default(""), channel: z.enum(["facebook_link", "direct"]).default("direct"), companions: z.array(personSchema.extend({ name: z.string().trim().max(100) })).max(19).default([]) });
export type GuestInput = z.input<typeof guestInputSchema>;

function rawTokenValid(key: string, booking: Booking) {
  return tokenValid(key, { token_revoked: booking.tokenRevoked, token_expires_at: booking.tokenExpiresAt, token_digest: booking.tokenDigest, legacy_token_digest: booking.legacyTokenDigest || (booking.accessKey ? digest(booking.accessKey) : null) });
}
export async function guestContext(db: NodePgDatabase, key: PlayerBookingAccess, lock = false) {
  if (typeof key === "string" && (key.length < 24 || key.length > 256)) throw new AppError(404, "Liên kết không còn khả dụng.");
  const hash = typeof key === "string" ? digest(key) : "";
  let [booking] = await db.select().from(bookings).where(typeof key === "string" ? or(eq(bookings.tokenDigest, hash), eq(bookings.legacyTokenDigest, hash), eq(bookings.accessKey, key)) : eq(bookings.id, key.bookingId)).limit(1);
  if (!booking) throw new AppError(404, "Liên kết không còn khả dụng.");
  if (typeof key !== "string") await requireLinkedMember(db, key.accountId, booking.memberId);
  const query = db.select().from(sessions).where(eq(sessions.id, booking.sessionId));
  const [game] = await (lock ? query.for("update") : query);
  if (lock) [booking] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
  if (!game || !booking || (typeof key === "string" && !rawTokenValid(key, booking))) throw new AppError(404, "Liên kết không còn khả dụng.");
  const [member] = await db.select().from(members).where(eq(members.id, booking.memberId));
  const clubQuery = db.select().from(clubs).where(eq(clubs.id, game.clubId));
  const [club] = await (lock ? clubQuery.for("update") : clubQuery);
  if (typeof key !== "string" && lock) await requireLinkedMember(db, key.accountId, booking.memberId, true);
  return { booking, game, member, club };
}
async function ownsContact(db: NodePgDatabase, game: Game, member: Member | undefined, owner: GuestOwner) {
  if (!member || !owner) return false;
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, owner.booking), eq(bookings.sessionId, game.id), eq(bookings.memberId, member.id)));
  return !!booking && rawTokenValid(owner.key, booking);
}
async function memberByPhone(db: NodePgDatabase, clubId: number, phone: string) {
  const [member] = await db.select().from(members).where(and(eq(members.clubId, clubId), inArray(members.phone, phoneAliases(phone)))).orderBy(asc(members.id)).limit(1);
  return member;
}

// Byte-compatible Python repr for the scalar list used by existing lookup HMACs.
function pythonString(value: string) {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === "\\" || char === quote) out += "\\" + char;
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (char !== " " && /[\p{C}\p{Z}]/u.test(char)) out += code < 256 ? "\\x" + code.toString(16).padStart(2, "0") : code < 65536 ? "\\u" + code.toString(16).padStart(4, "0") : "\\U" + code.toString(16).padStart(8, "0");
    else out += char;
  }
  return out + quote;
}
export function reviewVersion(game: Pick<Game, "fixedFee" | "guestFee" | "fixedFeeMale" | "fixedFeeFemale" | "guestFeeMale" | "guestFeeFemale">, member: Member | undefined) {
  const values = [member?.id ?? null, member?.name || "", member?.gender || "unspecified", member?.level || "", member?.kind || "guest", member ? memberFee(game, member) : null];
  const repr = "[" + values.map(v => v === null ? "None" : typeof v === "number" ? String(v) : pythonString(v)).join(", ") + "]";
  return createHmac("sha256", getConfig().SECRET_KEY).update(repr, "utf8").digest("hex");
}
function makeReview(game: Game, phone: string, member: Member | undefined, reveal: boolean) {
  const version = reviewVersion(game, member);
  return { phone, name: reveal && member ? member.name : "", gender: reveal && member ? member.gender : "unspecified", level: reveal && member ? member.level : "", kind: reveal && member ? member.kind : "guest", found: reveal && !!member, fee: reveal && member ? memberFee(game, member) : null, token: signPayload({ game: game.publicId, phone, version }, getConfig().SECRET_KEY, salts.lookup) };
}
export async function lookupGuest(publicId: string, rawPhone: string, owner: GuestOwner) {
  const db = getDb(); const [game] = await db.select().from(sessions).where(eq(sessions.publicId, publicId));
  if (!game) throw new AppError(404, "Không tìm thấy buổi chơi.");
  if (!guestOpen(game)) throw new AppError(400, "Đã đóng đăng ký hoặc đang ưu tiên thành viên.", "closed");
  let phone: string; try { phone = normalizePhone(rawPhone); } catch { throw new AppError(400, "Số điện thoại chưa hợp lệ."); }
  const member = await memberByPhone(db, game.clubId, phone);
  return makeReview(game, phone, member, await ownsContact(db, game, member, owner));
}
function partyFor(game: Game, member: Member, companions: z.infer<typeof guestInputSchema>["companions"]): PartyPerson[] {
  const party: PartyPerson[] = [{ position: 0, memberId: member.id, name: member.name, gender: member.gender as Gender, level: member.level, feeAmount: memberFee(game, member) }];
  for (const companion of companions) if (companion.name) party.push({ position: party.length, memberId: null, name: companion.name, gender: companion.gender, level: companion.level, feeAmount: memberFee(game, { kind: "guest", gender: companion.gender }) });
  if (party.length > game.capacity) throw new AppError(400, "Số người trong nhóm vượt sức chứa buổi chơi.");
  return party;
}
export async function joinGuest(publicId: string, raw: GuestInput, owner: GuestOwner = null) {
  const parsed = guestInputSchema.safeParse(raw); if (!parsed.success) throw new AppError(400, "Kiểm tra thông tin người chơi và người đi cùng.");
  const input = parsed.data; let phone: string; try { phone = normalizePhone(input.phone); } catch { throw new AppError(400, "Số điện thoại chưa hợp lệ."); }
  return transaction(async client => {
    const db = drizzle(client); const [game] = await db.select().from(sessions).where(eq(sessions.publicId, publicId)).for("update");
    if (!game) throw new AppError(404, "Không tìm thấy buổi chơi.");
    if (!guestOpen(game)) throw new AppError(400, "Đã đóng đăng ký hoặc qua hạn nhận người.", "closed");
    const [club] = await db.select().from(clubs).where(eq(clubs.id, game.clubId)).for("update");
    let member = await memberByPhone(db, game.clubId, phone);
    const owned = await ownsContact(db, game, member, owner);
    if (input.lookup_token) {
      const reviewed = readSigned(input.lookup_token, getConfig().SECRET_KEY, salts.lookup, lookupSchema, 15 * 60);
      if (reviewed.game !== publicId || reviewed.phone !== phone) throw new AppError(403, "Thông tin xác nhận không khớp. Vui lòng tra cứu lại.");
      if (reviewed.version !== reviewVersion(game, member)) throw new AppError(409, "Thông tin vừa được cập nhật. Vui lòng tra cứu lại.", "stale_profile");
    }
    if (member && !owned && input.name.trim().toLocaleLowerCase() !== member.name.trim().toLocaleLowerCase()) throw new AppError(409, "Thông tin liên hệ cần được host xác minh. Vui lòng nhập đúng họ tên đã đăng ký hoặc liên hệ host.");
    if (member?.kind === "fixed") return { message: "fixed", key: null, bookingId: null };
    if (!member) [member] = await db.insert(members).values({ clubId: game.clubId, name: input.name, phone, kind: "guest", gender: input.gender, level: input.level }).returning();
    const [existing] = await db.select().from(bookings).where(and(eq(bookings.sessionId, game.id), eq(bookings.memberId, member.id)));
    if (existing && (existing.status !== "cancelled" || !owned)) return { message: "already", key: null, bookingId: null };
    const party = partyFor(game, member, input.companions);
    const fits = await canFit(db, game, party.map(person => person.gender));
    const status = fits ? game.approvalMode === "AUTO_APPROVE" ? "confirmed" : "pending" : "waitlist";
    let result;
    if (existing) {
      await allowGuestChange(db, existing, game);
      await db.delete(people).where(eq(people.bookingId, existing.id));
      await db.insert(people).values(party.map(person => ({ ...person, bookingId: existing.id })));
      await db.update(bookings).set({ status, feeAmount: party.reduce((sum, p) => sum + p.feeAmount, 0) }).where(eq(bookings.id, existing.id));
      result = { booking: existing, key: owner!.key };
    } else result = await createBooking(db, game, club, member, status, party, input.channel);
    await auditChange(db, club.id, null, "Đăng ký tham gia", null, { booking_id: result.booking.id, status, size: party.length });
    return { message: "success", key: result.key, bookingId: result.booking.id };
  });
}

export async function guestDecision(key: PlayerBookingAccess, action: "cancel" | "yes" | "no") {
  return transaction(async client => {
    const db = drizzle(client); const { booking, game, member, club } = await guestContext(db, key, true);
    if (action !== "cancel" && member.kind !== "fixed") throw new AppError(403, "Chỉ thành viên cố định có thể RSVP.");
    if (game.isCancelled) throw new AppError(400, "Buổi chơi đã hủy.");
    if (booking.status === "rejected") throw new AppError(409, "Đăng ký đã bị host từ chối. Vui lòng liên hệ host.");
    if ((action === "cancel" && booking.status === "cancelled") || (action === "yes" && booking.status === "confirmed")) return;
    let status: string;
    if (action === "yes") {
      if (!registrationOpen(game) || (game.rsvpDeadline && localNow() > game.rsvpDeadline)) throw new AppError(400, "Đã qua hạn RSVP hoặc đóng đăng ký. Vui lòng liên hệ host.");
      const party = await participants(db, booking.id);
      if (game.attendanceLocked || party.some(p => p.attendanceStatus !== "NOT_MARKED")) throw new AppError(409, "Đăng ký đã được host xử lý. Vui lòng liên hệ host.");
      status = await canFit(db, game, party.length ? party.map(p => p.gender) : [booking.genderAtBooking]) ? "confirmed" : "waitlist";
    } else { await allowGuestChange(db, booking, game, false); status = "cancelled"; }
    await db.update(bookings).set({ status }).where(eq(bookings.id, booking.id));
    if (status === "cancelled") await promoteWaitlist(db, game);
    await auditChange(db, club.id, null, "Người chơi cập nhật tham gia", { status: booking.status }, { booking_id: booking.id, status });
  });
}

export async function editGuestGroup(key: PlayerBookingAccess, companions: GuestInput["companions"]) {
  return transaction(async client => {
    const db = drizzle(client); const { booking, game, member, club } = await guestContext(db, key, true);
    await allowGuestChange(db, booking, game);
    if (["cancelled", "rejected", "invited"].includes(booking.status) || member.kind !== "guest") throw new AppError(400, "Đăng ký này không thể tự sửa. Vui lòng liên hệ host.");
    const parsed = guestInputSchema.safeParse({ name: member.name, phone: member.phone, gender: member.gender, level: member.level, companions });
    if (!parsed.success) throw new AppError(400, "Thông tin người đi cùng chưa hợp lệ.");
    const party = partyFor(game, member, parsed.data.companions); const previous = await participants(db, booking.id);
    const fits = await canFit(db, game, party.map(p => p.gender), booking.id);
    if (!fits && booking.status === "confirmed") throw new AppError(409, "Không đủ chỗ cho cả nhóm. Đăng ký hiện tại được giữ nguyên.");
    let status = booking.status;
    if (party.length > (previous.length || 1)) status = fits ? game.approvalMode === "AUTO_APPROVE" ? "confirmed" : "pending" : "waitlist";
    await db.delete(people).where(eq(people.bookingId, booking.id));
    await db.insert(people).values(party.map(p => ({ ...p, bookingId: booking.id })));
    await db.update(bookings).set({ status, feeAmount: party.reduce((sum, p) => sum + p.feeAmount, 0) }).where(eq(bookings.id, booking.id));
    if (booking.status === "confirmed" && (party.length < previous.length || status !== "confirmed")) await promoteWaitlist(db, game, booking.id);
    await auditChange(db, club.id, null, "Sửa nhóm đăng ký", { status: booking.status, people: previous.map(p => ({ name: p.name, gender: p.gender })) }, { booking_id: booking.id, status, people: party.map(p => ({ name: p.name, gender: p.gender })) });
  });
}
