import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/server/db/client";
import { requireActiveAccount } from "@/server/auth/account-status";
import { capabilities, hasPermission, requireClubAccess } from "@/server/access/permissions";
import { subscriptionState } from "@/domain/subscription";
import { localNow } from "@/domain/session-policy";
import { AppError } from "@/server/errors";
import { gameActor } from "@/server/modules/scheduling/service";
import { observeWelcome, activationChoice, activationMilestone } from "./activation";
import { missions, missionById, nextSetup, type MissionId, type TourSnapshot } from "@/features/onboarding/registry";

const id = z.number().int().min(1).max(2147483647);
export const tourCommandSchema = z.object({
  action: z.enum(["welcome", "start", "resume", "pause", "dismiss", "restart", "select", "skip", "refresh", "share"]),
  revision: z.number().int().min(0), clubId: id.nullable(), missionId: z.string().max(40).optional(), sessionId: id.optional(),
}).strict();
type Preference = { status: TourSnapshot["status"]; mission_id: MissionId | null; club_id: number | null; revision: number };
type ProgressRow = { mission_id: string; completed_at: string | null; skipped_at: string | null };

async function snapshot(client: PoolClient, accountId: number, requestedClub?: number | null): Promise<TourSnapshot> {
  const db = drizzle(client);
  await requireActiveAccount(db, accountId);
  const preference = (await client.query<Preference>("SELECT status,mission_id,club_id,revision FROM clubhost.host_tour_preferences WHERE account_id=$1", [accountId])).rows[0];
  const clubs = (await client.query<{ id: number; name: string; owner_id: number }>(`SELECT c.id,c.name,c.owner_id FROM clubhost.clubs c
    LEFT JOIN clubhost.club_access a ON a.club_id=c.id AND a.host_id=$1
    WHERE c.owner_id=$1 OR a.host_id=$1 ORDER BY (c.owner_id=$1) DESC,c.id DESC`, [accountId])).rows;
  if (requestedClub && !clubs.some(c => c.id === requestedClub)) throw new AppError(404, "Không tìm thấy câu lạc bộ.");
  const clubId = requestedClub || clubs.find(c => c.id === preference?.club_id)?.id || clubs[0]?.id || null;
  let rights: ReturnType<typeof capabilities> = [], owner = false, pro = false;
  let facts: Record<string, boolean> = { club: !!clubId };
  let sessionId: number | null = null, shareSessionId: number | null = null, billingSessionId: number | null = null;
  let saved: ProgressRow[] = [];
  if (clubId) {
    const access = await requireClubAccess(db, accountId, clubId);
    rights = access.rights; owner = access.owner; pro = subscriptionState(access.club).active;
    const games = (await client.query<{ id: number; shareable: boolean }>(`SELECT id,
      lifecycle_status='OPEN' AND is_open AND starts_at>$2 AND (registration_deadline IS NULL OR registration_deadline>$2) AS shareable
      FROM clubhost.game_sessions WHERE club_id=$1 AND NOT is_cancelled ORDER BY shareable DESC,starts_at DESC,id DESC LIMIT 1`, [clubId, localNow()])).rows;
    sessionId = games.find(g => g.shareable)?.id ?? games[0]?.id ?? null;
    shareSessionId = games.find(g => g.shareable)?.id ?? null;
    billingSessionId = (await client.query<{ id: number }>(`SELECT g.id FROM clubhost.game_sessions g LEFT JOIN clubhost.charge_batches b ON b.session_id=g.id
      WHERE g.club_id=$1 AND NOT g.is_cancelled ORDER BY (b.id IS NOT NULL) DESC,g.starts_at DESC LIMIT 1`, [clubId])).rows[0]?.id ?? sessionId;
    facts = { club: true, session: !!sessionId, payment: !!((access.club.bankName && access.club.accountNumber && access.club.accountHolder) || access.club.qrKey), ...(await client.query<Record<string, boolean>>(`SELECT
      EXISTS(SELECT 1 FROM clubhost.members WHERE club_id=$1) AS members,
      EXISTS(SELECT 1 FROM clubhost.bookings b JOIN clubhost.game_sessions g ON g.id=b.session_id JOIN clubhost.members m ON m.id=b.member_id WHERE g.club_id=$1 AND m.kind='fixed' AND (b.status='invited' OR g.recurring_rule_id IS NOT NULL)) AS invitations,
      EXISTS(SELECT 1 FROM clubhost.bookings b JOIN clubhost.game_sessions g ON g.id=b.session_id WHERE g.club_id=$1 AND b.status IN ('confirmed','pending','waitlist')) AS bookings,
      EXISTS(SELECT 1 FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id JOIN clubhost.game_sessions g ON g.id=b.session_id WHERE g.club_id=$1 AND p.attendance_status<>'NOT_MARKED') AS attendance,
      EXISTS(SELECT 1 FROM clubhost.charge_batches b JOIN clubhost.game_sessions g ON g.id=b.session_id WHERE g.club_id=$1) AS billing,
      EXISTS(SELECT 1 FROM clubhost.money_movements m JOIN clubhost.game_sessions g ON g.id=m.session_id WHERE g.club_id=$1 AND m.amount>0 AND m.kind='RECEIVED') AS receipt,
      EXISTS(SELECT 1 FROM clubhost.monthly_dues d JOIN clubhost.members m ON m.id=d.member_id WHERE m.club_id=$1) AS monthly,
      EXISTS(SELECT 1 FROM clubhost.payment_proofs p LEFT JOIN clubhost.bookings b ON b.id=p.booking_id LEFT JOIN clubhost.game_sessions g ON g.id=b.session_id LEFT JOIN clubhost.monthly_dues d ON d.id=p.due_id LEFT JOIN clubhost.members m ON m.id=d.member_id WHERE (g.club_id=$1 OR m.club_id=$1) AND p.status IN ('confirmed','rejected')) AS proofs,
      EXISTS(SELECT 1 FROM clubhost.member_account_links l JOIN clubhost.members m ON m.id=l.member_id WHERE m.club_id=$1) AS connections,
      EXISTS(SELECT 1 FROM clubhost.recurring_rules WHERE club_id=$1) AS recurrence,
      EXISTS(SELECT 1 FROM clubhost.club_access WHERE club_id=$1) AS access,
      EXISTS(SELECT 1 FROM clubhost.reminder_settings WHERE club_id=$1 AND (rsvp_enabled OR payment_enabled OR monthly_enabled)) AS reminders`, [clubId])).rows[0] };
    saved = (await client.query<ProgressRow>("SELECT mission_id,completed_at,skipped_at FROM clubhost.host_tour_progress WHERE account_id=$1 AND club_id=$2", [accountId, clubId])).rows;
    if (!facts.invitations && hasPermission(owner, rights, "manage_bookings")) {
      // Invitations may already have replies. Match a positive creation count
      // in the audit receipt and a real member booking in that same session.
      // Legacy free-text audit details must never be cast to JSON in SQL.
      const receipts = (await client.query<{ details: string }>("SELECT details FROM clubhost.audit_logs WHERE club_id=$1 AND action='Tạo link RSVP cho thành viên'", [clubId])).rows;
      const ids = receipts.flatMap(row => { try { const after = JSON.parse(row.details)?.after; return id.safeParse(after?.game_id).success && Number.isSafeInteger(after.created) && after.created > 0 ? [after.game_id as number] : []; } catch { return []; } });
      if (ids.length) facts.invitations = (await client.query(`SELECT 1 FROM clubhost.bookings b JOIN clubhost.game_sessions g ON g.id=b.session_id JOIN clubhost.members m ON m.id=b.member_id WHERE g.club_id=$1 AND b.session_id=ANY($2::int[]) AND m.kind='fixed' LIMIT 1`, [clubId, ids])).rowCount !== 0;
    }
    facts.share = !!saved.find(p => p.mission_id === "share" && p.completed_at);
  }
  const can = (cap: typeof missions[number]["capability"]) => hasPermission(owner, rights, cap);
  const progress = missions.map(mission => {
    // Sharing permits either of the existing SessionShare capabilities.
    const allowed = mission.id === "club" && !clubId || (clubId && (mission.id === "share" ? can("manage_session") || can("manage_bookings") : can(mission.capability)));
    const entitlement = !("pro" in mission && mission.pro) || pro;
    const prerequisite = mission.prerequisites.every(key => facts[key]);
    const shareable = mission.id !== "share" || !!shareSessionId || !!facts.share;
    const reason = !allowed ? "Bạn chưa có quyền thực hiện nhiệm vụ này." : !entitlement ? "Cần Pro hoặc thời gian dùng thử còn hiệu lực." : !prerequisite ? "Hoàn thành nhiệm vụ cần thiết trước." : !shareable ? "Cần một buổi sắp tới đang mở đăng ký để chia sẻ." : null;
    return { id: mission.id, done: mission.id === "club" && !!clubId || !!allowed && !!facts[mission.completion], skipped: !!saved.find(p => p.mission_id === mission.id && p.skipped_at), available: !reason, reason };
  });
  return { revision: preference?.revision ?? 0, status: preference?.status ?? "new", missionId: missionById(preference?.mission_id ?? "")?.id ?? null,
    context: { clubId, sessionId, shareSessionId, billingSessionId }, clubs: clubs.map(({ id, name }) => ({ id, name })), progress };
}

export async function onboardingSnapshot(accountId: number, clubId?: number | null) {
  if (clubId !== undefined && clubId !== null && !id.safeParse(clubId).success) throw new AppError(400, "CLB chưa hợp lệ.");
  return transaction(client => snapshot(client, accountId, clubId), { readOnly: true });
}

export async function onboardingSessionSnapshot(accountId: number, sessionId: number) {
  if (!id.safeParse(sessionId).success) throw new AppError(400, "Buổi chơi chưa hợp lệ.");
  return transaction(async client => {
    const { game } = await gameActor(drizzle(client), accountId, sessionId, "view");
    const result = await snapshot(client, accountId, game.clubId);
    if (!game.isCancelled) {
      result.context.sessionId = game.id; result.context.billingSessionId = game.id;
      if (game.isOpen && game.lifecycleStatus === "OPEN" && game.startsAt > localNow() && (!game.registrationDeadline || game.registrationDeadline > localNow())) result.context.shareSessionId = game.id;
    }
    return result;
  }, { readOnly: true });
}

export async function updateOnboarding(accountId: number, raw: unknown) {
  const parsed = tourCommandSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Thao tác hướng dẫn chưa hợp lệ.");
  const command = parsed.data;
  if (command.missionId && !missionById(command.missionId)) throw new AppError(400, "Không tìm thấy nhiệm vụ.");
  return transaction(async client => {
    await requireActiveAccount(drizzle(client), accountId);
    // Account lock serializes preference creation and concurrent tabs without lost writes.
    await client.query("SELECT id FROM clubhost.hosts WHERE id=$1 FOR UPDATE", [accountId]);
    const before = await snapshot(client, accountId, command.clubId);
    if (before.revision !== command.revision) throw new AppError(409, "Hướng dẫn đã thay đổi ở cửa sổ khác. Đã tải lại tiến độ mới.", "tour_conflict");
    const clubId = before.context.clubId;
    let missionId = before.missionId, status = before.status;
    const now = new Date().toISOString();
    if (command.action === "welcome") {
      if (before.clubs.length || before.status !== "new") throw new AppError(409, "Hướng dẫn đã thay đổi. Vui lòng tải lại.");
      await observeWelcome(client, accountId);
    }
    if (command.action === "start" || command.action === "dismiss") await activationChoice(client, accountId, command.action);
    if (["select", "skip"].includes(command.action)) {
      const mission = missionById(command.missionId ?? "");
      const state = before.progress.find(p => p.id === mission?.id);
      if (!mission || !state?.available) throw new AppError(403, state?.reason || "Nhiệm vụ chưa sẵn sàng.");
      missionId = mission.id;
    }
    if (command.action === "share") {
      const { game } = await gameActor(drizzle(client), accountId, command.sessionId ?? 0, "view");
      const access = await requireClubAccess(drizzle(client), accountId, game.clubId);
      if (game.clubId !== clubId || !hasPermission(access.owner, access.rights, "manage_session") && !hasPermission(access.owner, access.rights, "manage_bookings")) throw new AppError(403, "Bạn chưa có quyền chia sẻ buổi này.");
      if (game.isCancelled || !game.isOpen || game.lifecycleStatus !== "OPEN" || game.startsAt <= localNow() || game.registrationDeadline && game.registrationDeadline <= localNow()) throw new AppError(409, "Buổi này không còn mở đăng ký.");
      await client.query(`INSERT INTO clubhost.host_tour_progress(account_id,club_id,mission_id,completed_at) VALUES($1,$2,'share',$3)
        ON CONFLICT(account_id,club_id,mission_id) DO UPDATE SET completed_at=COALESCE(host_tour_progress.completed_at,EXCLUDED.completed_at),skipped_at=NULL`, [accountId, clubId, now]);
      await activationMilestone(client, accountId, game.clubId, "share");
    }
    if (command.action === "restart" && clubId) await client.query("UPDATE clubhost.host_tour_progress SET skipped_at=NULL WHERE account_id=$1 AND club_id=$2", [accountId, clubId]);
    if (command.action === "skip" && clubId && missionId) await client.query(`INSERT INTO clubhost.host_tour_progress(account_id,club_id,mission_id,skipped_at) VALUES($1,$2,$3,$4)
      ON CONFLICT(account_id,club_id,mission_id) DO UPDATE SET skipped_at=EXCLUDED.skipped_at`, [accountId, clubId, missionId, now]);
    // Persist only server-proven achievements, never client-submitted completion flags.
    if (clubId) for (const step of before.progress.filter(p => p.done)) await client.query(`INSERT INTO clubhost.host_tour_progress(account_id,club_id,mission_id,completed_at) VALUES($1,$2,$3,$4)
      ON CONFLICT(account_id,club_id,mission_id) DO UPDATE SET completed_at=COALESCE(host_tour_progress.completed_at,EXCLUDED.completed_at)`, [accountId, clubId, step.id, now]);
    if (["start", "restart"].includes(command.action)) { status = "active"; missionId = nextSetup(await snapshot(client, accountId, clubId))?.id ?? null; }
    if (command.action === "resume") { status = "active"; missionId = before.progress.some(p => p.id === before.missionId && p.available) ? before.missionId : nextSetup(before)?.id ?? null; }
    if (command.action === "select") {
      status = "active";
      if (clubId) await client.query("UPDATE clubhost.host_tour_progress SET skipped_at=NULL WHERE account_id=$1 AND club_id=$2 AND mission_id=$3", [accountId, clubId, missionId]);
    }
    if (command.action === "skip") { missionId = nextSetup(await snapshot(client, accountId, clubId))?.id ?? null; if (!clubId) { status = "paused"; missionId = null; } }
    if (command.action === "refresh" && before.progress.some(p => p.id === missionId && p.done)) missionId = nextSetup(await snapshot(client, accountId, clubId))?.id ?? null;
    if (command.action === "pause") status = "paused";
    if (command.action === "dismiss") status = "dismissed";
    await client.query(`INSERT INTO clubhost.host_tour_preferences(account_id,status,mission_id,club_id,revision,updated_at) VALUES($1,$2,$3,$4,1,$5)
      ON CONFLICT(account_id) DO UPDATE SET status=EXCLUDED.status,mission_id=EXCLUDED.mission_id,club_id=EXCLUDED.club_id,revision=host_tour_preferences.revision+1,updated_at=EXCLUDED.updated_at`, [accountId, status, missionId, clubId, now]);
    return snapshot(client, accountId, clubId);
  });
}
