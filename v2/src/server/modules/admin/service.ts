import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { getPool, transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getSubscriptionPolicy } from "@/server/modules/subscriptions/policy";

type Queryable = Pick<PoolClient, "query">;
const idSchema = z.coerce.number().int().positive().max(2147483647);
export const modules = [
  "users",
  "hosts",
  "clubs",
  "sessions",
  "subscriptions",
  "audit-logs",
] as const;
export type AdminModule = (typeof modules)[number];
export const moduleSchema = z.enum(modules);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const filterSchema = z
  .object({
    q: z.string().trim().max(160).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    role: z.enum(["", "ADMIN", "HOST", "MEMBER"]).default(""),
    status: z.string().max(60).default(""),
    sort: z.enum(["newest", "oldest"]).default("newest"),
    from: day.optional(),
    to: day.optional(),
    actor: idSchema.optional(),
    club: idSchema.optional(),
    host: idSchema.optional(),
    user: idSchema.optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Khoảng ngày không hợp lệ",
  );
export type AdminFilters = z.input<typeof filterSchema>;
export type AdminRow = Record<string, string | number | boolean | null>;
const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const r = schema.safeParse(raw);
  if (!r.success) throw new AppError(400, "Bộ lọc hoặc dữ liệu không hợp lệ.");
  return r.data;
};
export async function assertAdmin(
  actorId: number,
  db: Queryable = getPool(),
  lock = false,
) {
  parse(idSchema, actorId);
  const { rows } = await db.query(
    `SELECT h.id FROM clubhost.hosts h WHERE h.id=$1 AND h.is_platform_admin
    AND NOT EXISTS (SELECT 1 FROM clubhost.account_controls a WHERE a.account_id=h.id AND a.suspended) ${lock ? "FOR UPDATE OF h" : ""}`,
    [actorId],
  );
  if (!rows.length)
    throw new AppError(403, "Chỉ Super Admin được truy cập khu vực này.");
}
const subscriptionSql = `CASE WHEN clubhost.admin_instant(c.pro_ends_at)>now() THEN 'PRO' WHEN clubhost.admin_instant(c.trial_ends_at)>now() THEN 'TRIAL' WHEN clubhost.admin_instant(c.pro_ends_at) IS NOT NULL OR clubhost.admin_instant(c.trial_ends_at) IS NOT NULL THEN 'EXPIRED' ELSE 'FREE' END`;
const roleSql = `CASE WHEN h.is_platform_admin THEN 'ADMIN' WHEN EXISTS(SELECT 1 FROM clubhost.clubs c WHERE c.owner_id=h.id) OR EXISTS(SELECT 1 FROM clubhost.club_access ca WHERE ca.host_id=h.id) THEN 'HOST' ELSE 'MEMBER' END`;
const userSql = `SELECT h.id,h.email,h.session_version AS version,
  (SELECT string_agg(DISTINCT m.name, ', ' ORDER BY m.name) FROM clubhost.member_account_links l JOIN clubhost.members m ON m.id=l.member_id WHERE l.account_id=h.id) AS name,
  ${roleSql} AS role, CASE WHEN coalesce(ac.suspended,false) THEN 'SUSPENDED' ELSE 'ACTIVE' END AS status,
  r.created_at, (SELECT max(a.created_at) FROM clubhost.audit_logs a WHERE a.host_id=h.id AND a.club_id IS NOT NULL AND a.action NOT IN ('Kích hoạt SportHost Pro','Thanh toán Pro cho CLB đã xóa')) AS last_activity,
  (SELECT count(*)::int FROM clubhost.clubs c WHERE c.owner_id=h.id OR EXISTS(SELECT 1 FROM clubhost.club_access ca WHERE ca.club_id=c.id AND ca.host_id=h.id)) AS clubs,
  (SELECT count(*)::int FROM clubhost.game_sessions s JOIN clubhost.clubs c ON c.id=s.club_id WHERE c.owner_id=h.id) AS sessions,
  (SELECT string_agg(DISTINCT ${subscriptionSql}, ', ') FROM clubhost.clubs c WHERE c.owner_id=h.id) AS subscription,
  (SELECT max(c.trial_ends_at) FROM clubhost.clubs c WHERE c.owner_id=h.id) AS trial_ends_at
  FROM clubhost.hosts h LEFT JOIN clubhost.account_controls ac ON ac.account_id=h.id LEFT JOIN clubhost.entity_registry r ON r.entity_type='user' AND r.entity_id=h.id`;
const clubSql = `SELECT c.id,c.name,c.owner_id,h.email AS host,${subscriptionSql} AS status,c.trial_ends_at,c.pro_ends_at,r.created_at,
  (SELECT count(*)::int FROM clubhost.members m WHERE m.club_id=c.id) AS members,
  (SELECT count(*)::int FROM clubhost.game_sessions s WHERE s.club_id=c.id) AS sessions
  FROM clubhost.clubs c JOIN clubhost.hosts h ON h.id=c.owner_id LEFT JOIN clubhost.entity_registry r ON r.entity_type='club' AND r.entity_id=c.id`;
const subscriptionListSql = `SELECT c.id,c.name,c.owner_id,h.email AS host,${subscriptionSql} AS status,
  CASE WHEN ${subscriptionSql} IN ('PRO','TRIAL') THEN 'SportHost Pro' ELSE 'Cơ bản' END AS plan,r.created_at AS trial_started_at,c.trial_ends_at,c.pro_ends_at,r.created_at,
  p.status AS payment_verification,p.created_at AS order_created_at,p.paid_at,
  clubhost.admin_instant(paid.activated_until)-make_interval(days=>paid.period_days) AS billing_period_start,
  paid.activated_until AS billing_period_end,
  greatest(clubhost.admin_instant(c.pro_ends_at),clubhost.admin_instant(c.trial_ends_at)) AS expires_at
  FROM clubhost.clubs c JOIN clubhost.hosts h ON h.id=c.owner_id
  LEFT JOIN clubhost.entity_registry r ON r.entity_type='club' AND r.entity_id=c.id
  LEFT JOIN LATERAL (SELECT status,created_at,paid_at,activated_until,period_days FROM clubhost.payment_orders
    WHERE club_id=c.id ORDER BY created_at DESC,order_code DESC LIMIT 1) p ON true
  LEFT JOIN LATERAL (SELECT activated_until,period_days FROM clubhost.payment_orders WHERE club_id=c.id AND status='PAID' AND paid_at IS NOT NULL ORDER BY paid_at DESC,order_code DESC LIMIT 1) paid ON true`;
const sessionSql = `SELECT s.id,s.title,s.club_id,c.name AS club,c.owner_id,h.email AS host,s.starts_at,s.lifecycle_status AS status,s.attendance_locked,s.is_open,r.created_at,
  (SELECT coalesce(sum(greatest(1,(SELECT count(*) FROM clubhost.booking_participants p WHERE p.booking_id=b.id))),0)::int FROM clubhost.bookings b WHERE b.session_id=s.id AND b.status='confirmed') AS participants,
  (SELECT count(*)::int FROM clubhost.booking_participants p JOIN clubhost.bookings b ON b.id=p.booking_id WHERE b.session_id=s.id AND p.attendance_status='CHECKED_IN') AS attended,
  (SELECT coalesce(sum(b.fee_amount) FILTER(WHERE b.paid),0)::bigint FROM clubhost.bookings b WHERE b.session_id=s.id) AS paid_booking_fees,
  (SELECT coalesce(sum(m.amount),0)::bigint FROM clubhost.money_movements m WHERE m.session_id=s.id) AS net_recorded
  FROM clubhost.game_sessions s JOIN clubhost.clubs c ON c.id=s.club_id JOIN clubhost.hosts h ON h.id=c.owner_id LEFT JOIN clubhost.entity_registry r ON r.entity_type='session' AND r.entity_id=s.id`;
const auditSql = `SELECT a.id,a.actor_id,a.action,a.target_type,a.target_id,a.created_at,a.reason FROM clubhost.admin_audit_events a`;
function source(module: AdminModule) {
  return module === "users" || module === "hosts"
    ? userSql
    : module === "sessions"
      ? sessionSql
      : module === "audit-logs"
        ? auditSql
        : module === "subscriptions"
          ? subscriptionListSql
          : clubSql;
}
export async function adminList(
  actorId: number,
  moduleRaw: string,
  raw: unknown = {},
) {
  await assertAdmin(actorId);
  const module = parse(moduleSchema, moduleRaw);
  const f = parse(filterSchema, raw);
  const values: unknown[] = [];
  const terms: string[] = [];
  const bind = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (module === "hosts")
    terms.push("role IN ('HOST','ADMIN') AND (clubs>0 OR role='HOST')");
  if (f.q) {
    const p = bind("%" + f.q.replace(/[\\%_]/g, "\\$&") + "%");
    terms.push(
      module === "users" || module === "hosts"
        ? `(email ILIKE ${p} OR coalesce(name,'') ILIKE ${p})`
        : module === "sessions"
          ? `(title ILIKE ${p} OR club ILIKE ${p} OR host ILIKE ${p})`
          : module === "audit-logs"
            ? `(action ILIKE ${p} OR reason ILIKE ${p})`
            : `(name ILIKE ${p} OR host ILIKE ${p})`,
    );
  }
  if (f.role && ["users", "hosts"].includes(module))
    terms.push(`role=${bind(f.role)}`);
  if (f.status) {
    const allowed =
      module === "audit-logs"
        ? [
            "suspend",
            "reactivate",
            "extend_trial",
            "extend_pro",
            "expire",
            "grant_admin",
            "revoke_admin",
            "verify_payment",
          ]
        : module === "users"
          ? ["ACTIVE", "SUSPENDED"]
          : module === "sessions"
            ? [
                "DRAFT",
                "OPEN",
                "IN_PROGRESS",
                "PLAY_FINISHED",
                "SETTLED",
                "CANCELLED",
              ]
            : ["PRO", "TRIAL", "EXPIRED", "FREE"];
    if (!allowed.includes(f.status))
      throw new AppError(400, "Trạng thái lọc không hợp lệ.");
    terms.push(
      `${module === "audit-logs" ? "action" : module === "hosts" ? "subscription" : "status"} ${module === "hosts" ? "LIKE" : "="} ${bind(module === "hosts" ? "%" + f.status + "%" : f.status)}`,
    );
  }
  const dateField = module === "sessions" ? "starts_at" : "created_at";
  if (f.from)
    terms.push(
      `${dateField} >= ${bind(module === "sessions" ? f.from + "T00:00" : f.from + "T00:00:00+07:00")}`,
    );
  if (f.to)
    terms.push(
      `${dateField} < ${bind(module === "sessions" ? new Date(Date.parse(f.to) + 86400000).toISOString().slice(0, 10) + "T00:00" : new Date(Date.parse(f.to) + 86400000).toISOString().slice(0, 10) + "T00:00:00+07:00")}`,
    );
  if (f.actor && module === "audit-logs")
    terms.push(`actor_id=${bind(f.actor)}`);
  if (f.club && module === "sessions") terms.push(`club_id=${bind(f.club)}`);
  if (f.host && ["clubs", "subscriptions", "sessions"].includes(module))
    terms.push(`owner_id=${bind(f.host)}`);
  if (f.user && module === "clubs") {
    const p = bind(f.user);
    terms.push(
      `(owner_id=${p} OR id IN (SELECT club_id FROM clubhost.club_access WHERE host_id=${p}) OR id IN (SELECT m.club_id FROM clubhost.members m JOIN clubhost.member_account_links l ON l.member_id=m.id WHERE l.account_id=${p}))`,
    );
  }
  const where = terms.length ? " WHERE " + terms.join(" AND ") : "";
  return transaction(
    async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await assertAdmin(actorId, db);
      const total = Number(
        (
          await db.query(
            `WITH data AS (${source(module)}) SELECT count(*) AS total FROM data${where}`,
            values,
          )
        ).rows[0].total,
      );
      const pages = Math.max(1, Math.ceil(total / 25));
      const page = Math.min(f.page, pages);
      const order = module === "sessions" ? "starts_at" : "created_at";
      const result = await db.query<AdminRow>(
        `WITH data AS (${source(module)}) SELECT * FROM data${where} ORDER BY ${order} ${f.sort === "oldest" ? "ASC" : "DESC"} NULLS LAST,id DESC LIMIT 25 OFFSET $${values.length + 1}`,
        [...values, (page - 1) * 25],
      );
      return { rows: result.rows, total, page, pages };
    },
    { readOnly: true },
  );
}
export async function adminDetail(
  actorId: number,
  moduleRaw: string,
  idRaw: unknown,
) {
  await assertAdmin(actorId);
  const module = parse(moduleSchema, moduleRaw),
    id = parse(idSchema, idRaw);
  const db = getPool();
  const result = await db.query<AdminRow>(
    `WITH data AS (${source(module)}) SELECT * FROM data WHERE id=$1`,
    [id],
  );
  if (!result.rows.length) throw new AppError(404, "Không tìm thấy bản ghi.");
  const history = await db.query(
    `SELECT id,action,created_at,reason,changes FROM clubhost.admin_audit_events WHERE target_type=$1 AND target_id=$2 ORDER BY id DESC LIMIT 30`,
    [
      module === "users" || module === "hosts"
        ? "user"
        : module === "sessions"
          ? "session"
          : module === "audit-logs"
            ? "audit"
            : "club",
      id,
    ],
  );
  let related: AdminRow[] = [];
  if (module === "sessions")
    related = (
      await db.query<AdminRow>(
        `SELECT b.status,b.payment_status,count(*)::int AS registrations,count(*) FILTER(WHERE b.attended)::int AS attended FROM clubhost.bookings b WHERE b.session_id=$1 GROUP BY b.status,b.payment_status`,
        [id],
      )
    ).rows;
  if (module === "subscriptions")
    related = (
      await db.query<AdminRow>(
        `SELECT order_code,status,amount,period_days,created_at,paid_at,activated_until FROM clubhost.payment_orders WHERE club_id=$1 ORDER BY created_at DESC LIMIT 30`,
        [id],
      )
    ).rows;
  if (module === "users" || module === "hosts")
    related = (
      await db.query<AdminRow>(
        `SELECT c.id,c.name,CASE WHEN c.owner_id=$1 THEN 'OWNER' WHEN ca.id IS NOT NULL THEN 'COHOST' ELSE 'MEMBER' END AS relationship FROM clubhost.clubs c LEFT JOIN clubhost.club_access ca ON ca.club_id=c.id AND ca.host_id=$1 WHERE c.owner_id=$1 OR ca.id IS NOT NULL OR EXISTS(SELECT 1 FROM clubhost.members m JOIN clubhost.member_account_links l ON l.member_id=m.id WHERE m.club_id=c.id AND l.account_id=$1) ORDER BY c.id DESC LIMIT 25`,
        [id],
      )
    ).rows;
  if (module === "audit-logs")
    related = (
      await db.query(
        `SELECT changes FROM clubhost.admin_audit_events WHERE id=$1`,
        [id],
      )
    ).rows;
  const activity =
    module === "users" || module === "hosts"
      ? (
          await db.query(
            `SELECT action,created_at FROM clubhost.audit_logs WHERE host_id=$1 ORDER BY id DESC LIMIT 30`,
            [id],
          )
        ).rows
      : [];
  if (module === "users" || module === "hosts") {
    const participation = (
      await db.query(
        `SELECT count(DISTINCT b.session_id)::int AS participant_registrations,count(*) FILTER(WHERE b.attended)::int AS participant_attended FROM clubhost.member_account_links l JOIN clubhost.bookings b ON b.member_id=l.member_id WHERE l.account_id=$1`,
        [id],
      )
    ).rows[0];
    Object.assign(result.rows[0], participation);
  }
  return { row: result.rows[0], history: history.rows, related, activity };
}
export async function adminOverview(actorId: number, raw: unknown = {}) {
  await assertAdmin(actorId);
  const f = parse(filterSchema, raw);
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const last = f.to || today;
  const first =
    f.from ||
    new Date(Date.parse(last) - 29 * 86400000).toISOString().slice(0, 10);
  const to = new Date(
    new Date(Date.parse(last) + 86400000).toISOString().slice(0, 10) +
      "T00:00:00+07:00",
  );
  const from = new Date(first + "T00:00:00+07:00");
  if (to <= from || to.valueOf() - from.valueOf() > 366 * 86400000)
    throw new AppError(400, "Chọn tối đa 366 ngày.");
  return transaction(
    async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await assertAdmin(actorId, db);
      const [metrics, growth, distribution, recent] = [
        await db.query(
          `SELECT (SELECT count(*)::int FROM clubhost.hosts) AS users,
      (SELECT count(*)::int FROM clubhost.hosts h WHERE EXISTS(SELECT 1 FROM clubhost.clubs c WHERE c.owner_id=h.id) OR EXISTS(SELECT 1 FROM clubhost.club_access ca WHERE ca.host_id=h.id)) AS hosts,
      (SELECT count(DISTINCT a.host_id)::int FROM clubhost.audit_logs a JOIN clubhost.hosts h ON h.id=a.host_id WHERE a.created_at >= $1 AND a.created_at < $2 AND a.club_id IS NOT NULL
        AND a.action NOT IN ('Kích hoạt SportHost Pro','Thanh toán Pro cho CLB đã xóa','Thành viên đăng ký từ lịch CLB')
        AND (EXISTS(SELECT 1 FROM clubhost.clubs c WHERE c.owner_id=h.id) OR EXISTS(SELECT 1 FROM clubhost.club_access ca WHERE ca.host_id=h.id))
        AND NOT EXISTS(SELECT 1 FROM clubhost.account_controls ac WHERE ac.account_id=a.host_id AND ac.suspended)) AS active_hosts,
      (SELECT count(*)::int FROM clubhost.clubs) AS clubs,(SELECT count(*)::int FROM clubhost.game_sessions) AS sessions,
      (SELECT count(*)::int FROM clubhost.clubs c WHERE ${subscriptionSql}='PRO' AND EXISTS(SELECT 1 FROM clubhost.payment_orders p WHERE p.club_id=c.id AND p.status='PAID' AND p.paid_at IS NOT NULL AND p.activated_until=c.pro_ends_at)) AS active_paid,
      (SELECT count(*)::int FROM clubhost.entity_registry WHERE entity_type='session' AND created_at>=now()-interval '30 days' AND created_at<=now()) AS sessions_30d,
      (SELECT count(*)::int FROM clubhost.game_sessions s WHERE NOT EXISTS(SELECT 1 FROM clubhost.entity_registry r WHERE r.entity_type='session' AND r.entity_id=s.id)) AS sessions_unknown,
      (SELECT count(*)::int FROM clubhost.hosts h WHERE NOT EXISTS(SELECT 1 FROM clubhost.entity_registry r WHERE r.entity_type='user' AND r.entity_id=h.id)) AS users_unknown,
      (SELECT coalesce(sum(x.amount::numeric*30/x.period_days),0) FROM clubhost.clubs c JOIN LATERAL (SELECT p.amount,p.period_days FROM clubhost.payment_orders p WHERE p.club_id=c.id AND p.status='PAID' AND p.paid_at IS NOT NULL AND p.activated_until=c.pro_ends_at ORDER BY p.paid_at DESC,p.order_code DESC LIMIT 1) x ON true WHERE ${subscriptionSql}='PRO') AS mrr,
      (SELECT coalesce(sum(amount),0) FROM clubhost.payment_orders WHERE status='PAID' AND paid_at >= $1::timestamptz AND paid_at < $2::timestamptz) AS collected`,
          [from.toISOString(), to.toISOString()],
        ),
        await db.query(
          `WITH daily AS (SELECT (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
        count(*) FILTER(WHERE r.entity_type='user')::int AS users,
        count(*) FILTER(WHERE r.entity_type='session')::int AS sessions,
        count(*) FILTER(WHERE r.entity_type='host')::int AS hosts
      FROM clubhost.entity_registry r WHERE r.created_at >= $1 AND r.created_at < $2 GROUP BY day)
      SELECT to_char(d.day,'YYYY-MM-DD') AS day,coalesce(a.users,0) AS users,coalesce(a.hosts,0) AS hosts,coalesce(a.sessions,0) AS sessions
      FROM generate_series($3::date,$4::date,interval '1 day') d(day) LEFT JOIN daily a ON a.day=d.day::date ORDER BY d.day`,
          [from.toISOString(), to.toISOString(), first, last],
        ),
        await db.query(
          `SELECT ${subscriptionSql} AS status,count(*)::int AS total FROM clubhost.clubs c GROUP BY status`,
        ),
        await db.query(`SELECT * FROM (
      SELECT 'admin'::text AS source,id,action,created_at,actor_id,target_type,target_id FROM clubhost.admin_audit_events
      UNION ALL SELECT 'platform',id,action,clubhost.admin_instant(created_at),host_id,'club',club_id FROM clubhost.audit_logs
      WHERE action IN ('Tạo CLB','Tạo buổi chơi','Tạo lịch lặp','Kích hoạt SportHost Pro','Xác minh email','Đặt lại mật khẩu')
      ) activity ORDER BY created_at DESC LIMIT 8`),
      ];
      return {
        metrics: metrics.rows[0],
        growth: growth.rows,
        distribution: distribution.rows,
        recent: recent.rows,
        from: first,
        to: last,
        policy: getSubscriptionPolicy(),
      };
    },
    { readOnly: true },
  );
}
const commandSchema = z
  .object({
    action: z.enum([
      "suspend",
      "reactivate",
      "extend_trial",
      "extend_pro",
      "expire",
    ]),
    targetId: idSchema,
    reason: z.string().trim().min(5).max(500),
    days: z.coerce.number().int().min(1).max(365).optional(),
    confirmed: z.literal(true),
    version: z.string().max(150),
  })
  .strict();
export async function adminCommand(actorId: number, raw: unknown) {
  const cmd = parse(commandSchema, raw);
  return transaction(async (db) => {
    // Serialize account administration, including concurrent last-admin checks.
    await db.query("SELECT pg_advisory_xact_lock(84621031)");
    await assertAdmin(actorId, db, true);
    const user = ["suspend", "reactivate"].includes(cmd.action);
    let before: Record<string, unknown>, after: Record<string, unknown>;
    if (user) {
      const target = (
        await db.query(
          `SELECT h.id,h.is_platform_admin,h.session_version,coalesce(ac.suspended,false) AS suspended FROM clubhost.hosts h LEFT JOIN clubhost.account_controls ac ON ac.account_id=h.id WHERE h.id=$1 FOR UPDATE OF h`,
          [cmd.targetId],
        )
      ).rows[0];
      if (!target) throw new AppError(404, "Không tìm thấy tài khoản.");
      if (String(target.session_version) !== cmd.version)
        throw new AppError(409, "Dữ liệu đã thay đổi. Vui lòng tải lại trang.");
      if (cmd.action === "suspend") {
        if (cmd.targetId === actorId)
          throw new AppError(
            409,
            "Không thể tự đình chỉ tài khoản đang đăng nhập.",
          );
        const count = Number(
          (
            await db.query(
              `SELECT count(*) FROM clubhost.hosts h WHERE h.is_platform_admin AND NOT EXISTS(SELECT 1 FROM clubhost.account_controls ac WHERE ac.account_id=h.id AND ac.suspended)`,
            )
          ).rows[0].count,
        );
        if (target.is_platform_admin && !target.suspended && count <= 1)
          throw new AppError(
            409,
            "Phải giữ ít nhất một Super Admin hoạt động.",
          );
      }
      const suspended = cmd.action === "suspend";
      if (target.suspended === suspended)
        throw new AppError(409, "Tài khoản đã ở trạng thái này.");
      before = { suspended: target.suspended };
      after = { suspended };
      await db.query(
        `INSERT INTO clubhost.account_controls(account_id,suspended) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET suspended=EXCLUDED.suspended`,
        [cmd.targetId, suspended],
      );
      await db.query(
        `UPDATE clubhost.hosts SET session_version=session_version+1 WHERE id=$1`,
        [cmd.targetId],
      );
    } else {
      const club = (
        await db.query(
          "SELECT id,trial_ends_at,pro_ends_at FROM clubhost.clubs WHERE id=$1 FOR UPDATE",
          [cmd.targetId],
        )
      ).rows[0];
      if (!club) throw new AppError(404, "Không tìm thấy CLB.");
      if (
        `${club.trial_ends_at || ""}|${club.pro_ends_at || ""}` !== cmd.version
      )
        throw new AppError(
          409,
          "Subscription đã thay đổi. Vui lòng tải lại trang.",
        );
      before = {
        trial_ends_at: club.trial_ends_at,
        pro_ends_at: club.pro_ends_at,
      };
      after = { ...before };
      const now = Date.now();
      if (cmd.action === "expire") {
        if (
          Math.max(
            Date.parse(club.pro_ends_at) || 0,
            Date.parse(club.trial_ends_at) || 0,
          ) <= now
        )
          throw new AppError(409, "Subscription không còn hoạt động.");
        after = {
          trial_ends_at: new Date(now).toISOString(),
          pro_ends_at: new Date(now).toISOString(),
        };
      } else {
        if (!cmd.days) throw new AppError(400, "Cần số ngày gia hạn.");
        if (
          cmd.action === "extend_trial" &&
          (Date.parse(club.pro_ends_at) || 0) > now
        )
          throw new AppError(
            409,
            "CLB đang dùng Pro; không thể gia hạn trial.",
          );
        if (cmd.action === "extend_pro") {
          const verified = await db.query(
            "SELECT 1 FROM clubhost.payment_orders WHERE club_id=$1 AND status='PAID' AND paid_at IS NOT NULL LIMIT 1",
            [cmd.targetId],
          );
          if (!club.pro_ends_at || !verified.rowCount)
            throw new AppError(
              409,
              "Kích hoạt Pro cần thanh toán payOS đã xác minh. Không thể kích hoạt bằng ảnh chuyển khoản.",
            );
        }
        const field =
          cmd.action === "extend_trial" ? "trial_ends_at" : "pro_ends_at";
        after[field] = new Date(
          Math.max(
            now,
            Date.parse(club[field]) || 0,
            cmd.action === "extend_pro"
              ? Date.parse(club.trial_ends_at) || 0
              : 0,
          ) +
            cmd.days * 86400000,
        ).toISOString();
      }
      await db.query(
        "UPDATE clubhost.clubs SET trial_ends_at=$2,pro_ends_at=$3 WHERE id=$1",
        [cmd.targetId, after.trial_ends_at, after.pro_ends_at],
      );
    }
    await db.query(
      "INSERT INTO clubhost.admin_audit_events(actor_id,action,target_type,target_id,reason,changes) VALUES($1,$2,$3,$4,$5,$6)",
      [
        actorId,
        cmd.action,
        user ? "user" : "club",
        cmd.targetId,
        cmd.reason,
        JSON.stringify({ before, after }),
      ],
    );
  });
}
