import "server-only";
import { and, eq, ne, inArray, asc, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomBytes } from "node:crypto";
import { transaction, getDb } from "@/server/db/client";
import { gameSessionsInClubhost as sessions, clubsInClubhost as clubs, recurringRulesInClubhost as rules, membersInClubhost as members, bookingsInClubhost as bookings, chargeBatchesInClubhost as batches, bookingParticipantsInClubhost as people } from "@/server/db/schema";
import { requireClubAccess, type Capability } from "@/server/access/permissions";
import { listClubs } from "@/server/modules/clubs/service";
import { sessionSchema, addWeeks, localNow, type SessionInput } from "@/domain/session-policy";
import { createBooking, auditChange, seatCounts, type Game, type Club } from "@/server/modules/bookings/core";
import { AppError } from "@/server/errors";

function policy(value: SessionInput, club: Club) {
  return { approval_mode: value.approval_mode, sport_snapshot: club.sportType, skill_guidance: value.skill_guidance, venue_instructions: value.venue_instructions, cancellation_policy: value.cancellation_policy, participation_conditions: value.participation_conditions, maps_url: value.maps_url, registration_deadline: value.registration_deadline, cancellation_deadline: value.cancellation_deadline, fee_mode: value.fee_mode, no_show_policy: value.no_show_policy, monthly_policy: value.monthly_policy };
}
function gameValues(value: SessionInput, club: Club) {
  return { clubId: club.id, publicId: randomBytes(18).toString("base64url"), title: value.title, venue: value.venue, startsAt: value.starts_at, capacity: value.capacity, capacityMale: value.capacity_male, capacityFemale: value.capacity_female, fixedFee: value.fixed_fee, guestFee: value.guest_fee, fixedFeeMale: value.fixed_fee_male, fixedFeeFemale: value.fixed_fee_female, guestFeeMale: value.guest_fee_male, guestFeeFemale: value.guest_fee_female, isOpen: true, approvalMode: value.approval_mode, sportSnapshot: club.sportType, skillGuidance: value.skill_guidance, venueInstructions: value.venue_instructions, cancellationPolicy: value.cancellation_policy, participationConditions: value.participation_conditions, mapsUrl: value.maps_url, registrationDeadline: value.registration_deadline, cancellationDeadline: value.cancellation_deadline, lifecycleStatus: "OPEN", attendanceLocked: false, feeMode: value.fee_mode, noShowPolicy: value.no_show_policy, monthlyPolicy: value.monthly_policy };
}
export async function gameActor(db: NodePgDatabase, hostId: number, gameId: number, capability: Capability, lock = false) {
  const query = db.select().from(sessions).where(eq(sessions.id, gameId));
  const [game] = await (lock ? query.for("update") : query);
  if (!game) throw new AppError(404, "Không tìm thấy buổi chơi.");
  // Member edits serialize on the club. Seat decisions must read their participant
  // genders only after that lock, in the same session -> club order as guest joins.
  if (lock) await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, game.clubId)).for("update");
  const access = await requireClubAccess(db, hostId, game.clubId, capability);
  return { game, ...access };
}
export function mutableAttendance(game: Game) {
  if (game.isCancelled || ["CANCELLED", "SETTLED"].includes(game.lifecycleStatus) || game.attendanceLocked) throw new AppError(409, "Điểm danh đã khóa. Cần điều chỉnh có lý do và đối soát.");
}
export async function requireDraft(db: NodePgDatabase, game: Game) {
  const [batch] = await db.select({ id: batches.id }).from(batches).where(eq(batches.sessionId, game.id));
  if (game.isCancelled || game.lifecycleStatus === "SETTLED" || game.attendanceLocked || batch) throw new AppError(409, "Cơ sở tính phí đã khóa. Cần điều chỉnh có lý do.");
}

export async function createSession(hostId: number, clubId: number, raw: Record<string, unknown>) {
  return transaction(async client => {
    const db = drizzle(client); const { club } = await requireClubAccess(db, hostId, clubId, "manage_session");
    const parsed = sessionSchema.safeParse({ fixed_fee: club.fixedFee, fixed_fee_male: club.fixedFeeMale, fixed_fee_female: club.fixedFeeFemale, approval_mode: club.defaultApprovalMode, fee_mode: club.defaultFeeMode, skill_guidance: club.skillGuidance, venue_instructions: club.venueInstructions, cancellation_policy: club.cancellationPolicy, ...raw });
    if (!parsed.success) throw new AppError(400, parsed.error.issues.map(i => i.message).join(" "));
    const value = parsed.data;
    if (value.weeks > 1) {
      const [rule] = await db.insert(rules).values({ clubId, title: value.title, venue: value.venue, firstStart: value.starts_at, weeks: value.weeks, capacity: value.capacity, capacityMale: value.capacity_male, capacityFemale: value.capacity_female, fixedFee: value.fixed_fee, guestFee: value.guest_fee, fixedFeeMale: value.fixed_fee_male, fixedFeeFemale: value.fixed_fee_female, guestFeeMale: value.guest_fee_male, guestFeeFemale: value.guest_fee_female, rsvpHours: value.rsvp_hours, active: true, policyJson: JSON.stringify(policy(value, club)) }).returning();
      const count = await generateRule(db, rule.id);
      await auditChange(db, clubId, hostId, "Tạo lịch lặp", null, { rule_id: rule.id, created: count });
      return { ruleId: rule.id, gameId: null };
    }
    const [game] = await db.insert(sessions).values(gameValues(value, club)).returning();
    await auditChange(db, clubId, hostId, "Tạo buổi chơi", null, { id: game.id, title: game.title });
    return { gameId: game.id, ruleId: null };
  });
}

export async function generateRule(db: NodePgDatabase, ruleId: number) {
  const [rule] = await db.select().from(rules).where(eq(rules.id, ruleId)).for("update");
  if (!rule || !rule.active) throw new AppError(400, "Lịch lặp đã dừng.");
  const [club] = await db.select().from(clubs).where(eq(clubs.id, rule.clubId));
  const fixed = await db.select().from(members).where(and(eq(members.clubId, rule.clubId), eq(members.kind, "fixed"))).orderBy(asc(members.id));
  const existing = new Set((await db.select({ startsAt: sessions.startsAt }).from(sessions).where(eq(sessions.recurringRuleId, rule.id))).map(g => g.startsAt));
  const saved = JSON.parse(rule.policyJson || "{}"); let count = 0;
  for (let week = 0; week < rule.weeks; week++) {
    const startsAt = addWeeks(rule.firstStart, week); if (existing.has(startsAt)) continue;
    const parsed = sessionSchema.parse({ approval_mode: club.defaultApprovalMode, fee_mode: club.defaultFeeMode, skill_guidance: club.skillGuidance, venue_instructions: club.venueInstructions, cancellation_policy: club.cancellationPolicy, title: rule.title, venue: rule.venue, starts_at: startsAt, capacity: rule.capacity, capacity_male: rule.capacityMale, capacity_female: rule.capacityFemale, fixed_fee: rule.fixedFee, guest_fee: rule.guestFee, fixed_fee_male: rule.fixedFeeMale, fixed_fee_female: rule.fixedFeeFemale, guest_fee_male: rule.guestFeeMale, guest_fee_female: rule.guestFeeFemale, ...saved, registration_deadline: saved.registration_deadline ? addWeeks(saved.registration_deadline, week) : null, cancellation_deadline: saved.cancellation_deadline ? addWeeks(saved.cancellation_deadline, week) : null });
    const [game] = await db.insert(sessions).values({ ...gameValues(parsed, club), sportSnapshot: saved.sport_snapshot || club.sportType, recurringRuleId: rule.id, rsvpDeadline: localNow(new Date(new Date(startsAt + ":00+07:00").valueOf() - rule.rsvpHours * 3600000)) }).returning();
    for (const member of fixed) await createBooking(db, game, club, member, "invited");
    count++;
  }
  return count;
}

export async function changeRule(hostId: number, ruleId: number, action: "stop" | "extend" | "generate", weeks = 4) {
  return transaction(async client => {
    const db = drizzle(client); const [rule] = await db.select().from(rules).where(eq(rules.id, ruleId)).for("update");
    if (!rule) throw new AppError(404, "Không tìm thấy lịch lặp.");
    await requireClubAccess(db, hostId, rule.clubId, "manage_session");
    if (action === "stop") await db.update(rules).set({ active: false }).where(eq(rules.id, rule.id));
    else {
      if (!rule.active) throw new AppError(400, "Lịch lặp đã dừng.");
      if (action === "extend") { if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12 || rule.weeks + weeks > 52) throw new AppError(400, "Gia hạn 1–12 tuần; tối đa 52 tuần."); await db.update(rules).set({ weeks: rule.weeks + weeks }).where(eq(rules.id, rule.id)); }
      await generateRule(db, rule.id);
    }
    await auditChange(db, rule.clubId, hostId, "Cập nhật lịch lặp", { weeks: rule.weeks, active: rule.active }, { action, weeks });
    return rule.clubId;
  });
}

export async function inviteFixed(hostId: number, gameId: number) {
  return transaction(async client => {
    const db = drizzle(client); const { game, club } = await gameActor(db, hostId, gameId, "manage_bookings", true); mutableAttendance(game);
    if (game.lifecycleStatus !== "OPEN") throw new AppError(409, "Chỉ tạo lời mời trước khi bắt đầu buổi chơi.");
    const existing = new Set((await db.select({ memberId: bookings.memberId }).from(bookings).where(eq(bookings.sessionId, gameId))).map(b => b.memberId));
    const fixed = await db.select().from(members).where(and(eq(members.clubId, club.id), eq(members.kind, "fixed")));
    for (const member of fixed) if (!existing.has(member.id)) await createBooking(db, game, club, member, "invited");
    await auditChange(db, club.id, hostId, "Tạo link RSVP cho thành viên", null, { game_id: game.id });
  });
}

export async function listSessions(hostId: number, clubId?: number) {
  const clubs = await listClubs(hostId); const ids = clubs.filter(c => !clubId || c.id === clubId).map(c => c.id);
  if (clubId && !ids.length) throw new AppError(404, "Không tìm thấy câu lạc bộ.");
  if (!ids.length) return [];
  const rows = await getDb().select({ id: sessions.id, clubId: sessions.clubId, title: sessions.title, venue: sessions.venue, startsAt: sessions.startsAt, capacity: sessions.capacity, isOpen: sessions.isOpen, isCancelled: sessions.isCancelled, lifecycleStatus: sessions.lifecycleStatus, publicId: sessions.publicId, registrationDeadline: sessions.registrationDeadline, recurringRuleId: sessions.recurringRuleId, rsvpDeadline: sessions.rsvpDeadline }).from(sessions).where(inArray(sessions.clubId, ids)).orderBy(asc(sessions.startsAt));
  return Promise.all(rows.map(async game => ({ ...game, clubName: clubs.find(c => c.id === game.clubId)!.name, confirmed: Object.values(await seatCounts(getDb(), game.id)).reduce((a, b) => a + b, 0) })));
}

export async function toggleSession(hostId: number, gameId: number) {
  await transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_session", true);
    if (game.isCancelled || game.lifecycleStatus !== "OPEN") throw new AppError(409, "Chỉ mở đăng ký khi buổi chưa bắt đầu.");
    await db.update(sessions).set({ isOpen: !game.isOpen }).where(eq(sessions.id, gameId));
  });
}
export async function cancelSession(hostId: number, gameId: number) {
  await transaction(async client => {
    const db = drizzle(client); const { game } = await gameActor(db, hostId, gameId, "manage_session", true); mutableAttendance(game);
    await db.update(sessions).set({ isCancelled: true, isOpen: false, lifecycleStatus: "CANCELLED" }).where(eq(sessions.id, gameId));
    await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.sessionId, gameId));
    await auditChange(db, game.clubId, hostId, "Hủy buổi chơi", { status: game.lifecycleStatus }, { status: "CANCELLED" });
  });
}
export async function editSession(hostId: number, gameId: number, raw: Record<string, unknown>) {
  await transaction(async client => {
    const db = drizzle(client); const { game, club } = await gameActor(db, hostId, gameId, "manage_session", true); await requireDraft(db, game);
    const parsed = sessionSchema.safeParse({ title: game.title, venue: game.venue, starts_at: game.startsAt, capacity: game.capacity, capacity_male: game.capacityMale, capacity_female: game.capacityFemale, fixed_fee: game.fixedFee, guest_fee: game.guestFee, fixed_fee_male: game.fixedFeeMale, fixed_fee_female: game.fixedFeeFemale, guest_fee_male: game.guestFeeMale, guest_fee_female: game.guestFeeFemale, approval_mode: game.approvalMode, fee_mode: game.feeMode, no_show_policy: game.noShowPolicy, monthly_policy: game.monthlyPolicy, skill_guidance: game.skillGuidance, venue_instructions: game.venueInstructions, cancellation_policy: game.cancellationPolicy, participation_conditions: game.participationConditions, maps_url: game.mapsUrl, registration_deadline: game.registrationDeadline, cancellation_deadline: game.cancellationDeadline, ...raw });
    if (!parsed.success) throw new AppError(400, "Kiểm tra thông tin, sức chứa và thời hạn của buổi chơi.");
    const value = parsed.data; const [booked] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.sessionId, gameId)).limit(1);
    if (booked && (value.fee_mode !== game.feeMode || value.no_show_policy !== game.noShowPolicy || value.monthly_policy !== game.monthlyPolicy)) throw new AppError(409, "Đã có đăng ký. Giữ chính sách phí đã công bố; dùng miễn/giảm có lý do khi chốt tiền.");
    const count = Object.values(await seatCounts(db, game.id)).reduce((a, b) => a + b, 0);
    if (value.capacity < count) throw new AppError(400, "Sức chứa không được thấp hơn số người đã xác nhận.");
    const genders = await db.select({ gender: people.gender, count: sql<number>`count(*)::int` }).from(people).innerJoin(bookings, eq(bookings.id, people.bookingId)).where(and(eq(bookings.sessionId, gameId), eq(bookings.status, "confirmed"), ne(people.attendanceStatus, "NO_SHOW"))).groupBy(people.gender);
    if (genders.some(g => (g.gender === "male" && value.capacity_male !== null && value.capacity_male < g.count) || (g.gender === "female" && value.capacity_female !== null && value.capacity_female < g.count))) throw new AppError(400, "Giới hạn nam/nữ không được thấp hơn số người đã xác nhận.");
    const updated = gameValues(value, club);
    const changedPolicy = (["approvalMode", "skillGuidance", "venueInstructions", "cancellationPolicy", "participationConditions", "mapsUrl", "registrationDeadline", "cancellationDeadline"] as const).some(k => updated[k] !== game[k]);
    const reason = String(raw.change_reason || "").trim();
    if (reason.length > 500 || (booked && changedPolicy && !reason)) throw new AppError(409, "Vui lòng ghi lý do khi thay đổi chính sách đã có người đăng ký.");
    await db.update(sessions).set({ title: value.title, venue: value.venue, startsAt: value.starts_at, capacity: value.capacity, capacityMale: value.capacity_male, capacityFemale: value.capacity_female, approvalMode: value.approval_mode, skillGuidance: value.skill_guidance, venueInstructions: value.venue_instructions, cancellationPolicy: value.cancellation_policy, participationConditions: value.participation_conditions, mapsUrl: value.maps_url, registrationDeadline: value.registration_deadline, cancellationDeadline: value.cancellation_deadline, feeMode: value.fee_mode, noShowPolicy: value.no_show_policy, monthlyPolicy: value.monthly_policy }).where(eq(sessions.id, gameId));
    await auditChange(db, game.clubId, hostId, "Sửa thông tin buổi chơi", { title: game.title, starts_at: game.startsAt, policy: { approval_mode: game.approvalMode, cancellation_policy: game.cancellationPolicy } }, { title: value.title, starts_at: value.starts_at, policy: policy(value, club) }, reason);
  });
}

export async function listRules(hostId: number, clubId?: number) {
  const clubs = (await listClubs(hostId)).filter(club => clubId === undefined || club.id === clubId);
  if (clubId !== undefined && !clubs.length) throw new AppError(404, "Không tìm thấy CLB.");
  if (!clubs.length) return [];
  const rows = await getDb().select({ id: rules.id, clubId: rules.clubId, title: rules.title, weeks: rules.weeks, firstStart: rules.firstStart, active: rules.active }).from(rules).where(inArray(rules.clubId, clubs.map(club => club.id))).orderBy(asc(rules.firstStart));
  return rows.map(rule => { const club = clubs.find(club => club.id === rule.clubId)!; return { ...rule, clubName: club.name, canManage: club.owner || club.rights.includes("manage_session") }; });
}
