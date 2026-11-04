import "server-only";
import { and, eq, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { hostsInClubhost as accounts, membersInClubhost as members, clubsInClubhost as clubs } from "@/server/db/schema";
import { memberAccountLinks as links } from "@/server/db/member-schema";
import { requireClubAccess } from "@/server/access/permissions";
import { auditChange } from "@/server/modules/bookings/core";
import { localNow } from "@/domain/session-policy";
import { AppError } from "@/server/errors";

export async function linkMemberAccount(ownerId: number, clubId: number, memberId: number, rawEmail: string) {
  const parsed = z.email().max(254).safeParse(rawEmail.trim().toLowerCase());
  if (!parsed.success) throw new AppError(400, "Nhập email tài khoản của thành viên.");
  return transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    await requireClubAccess(db, ownerId, clubId, "owner");
    const [member] = await db.select({ id: members.id }).from(members).where(and(eq(members.id, memberId), eq(members.clubId, clubId)));
    if (!member) throw new AppError(404, "Không tìm thấy thành viên.");
    const [account] = await db.select({ id: accounts.id, verified: accounts.emailVerified }).from(accounts).where(eq(accounts.email, parsed.data));
    if (!account?.verified) throw new AppError(400, "Thành viên cần tạo tài khoản và xác minh email này trước khi liên kết.");
    const [existing] = await db.select().from(links).where(eq(links.memberId, memberId)).for("update");
    if (existing?.accountId === account.id) return;
    if (existing) throw new AppError(409, "Hồ sơ đã liên kết tài khoản khác. Kiểm tra và gỡ liên kết cũ trước.");
    await db.insert(links).values({ memberId, accountId: account.id, linkedByHostId: ownerId, linkedAt: new Date().toISOString() });
    await auditChange(db, clubId, ownerId, "Liên kết tài khoản thành viên", null, { member_id: memberId, account_id: account.id });
  });
}

export async function unlinkMemberAccount(ownerId: number, clubId: number, memberId: number) {
  return transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    await requireClubAccess(db, ownerId, clubId, "owner");
    const [member] = await db.select({ id: members.id }).from(members).where(and(eq(members.id, memberId), eq(members.clubId, clubId)));
    if (!member) throw new AppError(404, "Không tìm thấy thành viên.");
    const [removed] = await db.delete(links).where(eq(links.memberId, memberId)).returning();
    if (removed) await auditChange(db, clubId, ownerId, "Gỡ liên kết tài khoản thành viên", { member_id: memberId, account_id: removed.accountId }, null);
  });
}

export async function clubMemberAccounts(ownerId: number, clubId: number) {
  await requireClubAccess(getDb(), ownerId, clubId, "owner");
  return getDb().select({ memberId: links.memberId, email: accounts.email }).from(links)
    .innerJoin(members, eq(members.id, links.memberId)).innerJoin(accounts, eq(accounts.id, links.accountId)).where(eq(members.clubId, clubId));
}

export async function playerProfiles(accountId: number) {
  return getDb().select({ id: members.id, name: members.name, phone: members.phone, gender: members.gender, level: members.level, kind: members.kind, clubName: clubs.name })
    .from(links).innerJoin(accounts, eq(accounts.id, links.accountId)).innerJoin(members, eq(members.id, links.memberId))
    .innerJoin(clubs, eq(clubs.id, members.clubId)).where(and(eq(links.accountId, accountId), eq(accounts.emailVerified, true))).orderBy(asc(clubs.name), asc(members.name));
}

export function pageNumber(raw: unknown) {
  const parsed = z.coerce.number().int().min(1).max(100000).safeParse(raw ?? 1);
  return parsed.success ? parsed.data : 1;
}
export type PlayerBooking = { id: number; title: string; club_name: string; starts_at: string; venue: string; status: string; kind: string; is_cancelled: boolean; lifecycle_status: string; party_size: number };
export async function playerCalendar(accountId: number, history = false, page = 1) {
  return transaction(async client => {
    const { rows } = await client.query<{ result: { total: number; upcoming: number; invitations: number; rows: PlayerBooking[] } }>(`
      WITH own AS (
        SELECT b.id,g.title,c.name AS club_name,g.starts_at,g.venue,b.status,m.kind,g.is_cancelled,g.lifecycle_status,
          (SELECT COUNT(*)::int FROM clubhost.booking_participants p WHERE p.booking_id=b.id) AS party_size,
          (g.starts_at >= $2 AND NOT g.is_cancelled AND g.lifecycle_status NOT IN ('PLAY_FINISHED','SETTLED','CANCELLED') AND b.status NOT IN ('cancelled','rejected')) AS upcoming
        FROM clubhost.member_account_links l JOIN clubhost.hosts a ON a.id=l.account_id AND a.email_verified
        JOIN clubhost.members m ON m.id=l.member_id JOIN clubhost.bookings b ON b.member_id=m.id
        JOIN clubhost.game_sessions g ON g.id=b.session_id JOIN clubhost.clubs c ON c.id=g.club_id
        WHERE l.account_id=$1
      ), selected AS (SELECT * FROM own WHERE upcoming=$3)
      SELECT json_build_object('total',(SELECT count(*) FROM selected),'upcoming',(SELECT count(*) FROM own WHERE upcoming),
        'invitations',(SELECT count(*) FROM own WHERE upcoming AND status='invited'),
        'rows',COALESCE((SELECT json_agg(r) FROM (SELECT id,title,club_name,starts_at,venue,status,kind,is_cancelled,lifecycle_status,party_size FROM selected
          ORDER BY CASE WHEN $3 THEN starts_at END ASC,CASE WHEN NOT $3 THEN starts_at END DESC,id DESC LIMIT 20 OFFSET $4) r),'[]'::json)) AS result
    `, [accountId, localNow(), !history, (pageNumber(page) - 1) * 20]);
    return rows[0].result;
  }, { readOnly: true });
}

export type PlayerPayment = { id: number; type: "booking" | "due"; title: string; club_name: string; date: string; amount: number | null; net: number; outstanding: number; credit: number; reported: boolean; issued: boolean };
export async function playerPayments(accountId: number, page = 1) {
  return transaction(async client => {
    // Aggregate each issued payer independently before summing a group: one person's
    // credit must never erase a different person's debt. No draft cost-sharing estimate.
    const { rows } = await client.query<{ result: { total: number; outstanding: number; credit: number; net: number; rows: PlayerPayment[] } }>(`
      WITH own_members AS (
        SELECT m.id,m.club_id FROM clubhost.member_account_links l JOIN clubhost.hosts a ON a.id=l.account_id AND a.email_verified
        JOIN clubhost.members m ON m.id=l.member_id WHERE l.account_id=$1
      ), own_bookings AS (
        SELECT b.*,g.title,g.starts_at,g.fee_mode,g.fixed_fee,g.guest_fee,g.is_cancelled,c.name AS club_name,m.kind,
          cb.id AS batch_id FROM own_members om JOIN clubhost.members m ON m.id=om.id
        JOIN clubhost.bookings b ON b.member_id=om.id JOIN clubhost.game_sessions g ON g.id=b.session_id
        JOIN clubhost.clubs c ON c.id=g.club_id LEFT JOIN clubhost.charge_batches cb ON cb.session_id=g.id
      ), charge_values AS (
        SELECT ch.booking_id,ch.payer_participant_id,sum(ch.amount+COALESCE(adj.amount,0)) AS amount FROM clubhost.charges ch
        JOIN own_bookings ob ON ob.id=ch.booking_id
        LEFT JOIN (SELECT charge_id,sum(amount) AS amount FROM clubhost.charge_adjustments GROUP BY charge_id) adj ON adj.charge_id=ch.id
        GROUP BY ch.booking_id,ch.payer_participant_id
      ), money_values AS (
        SELECT mm.booking_id,mm.payer_participant_id,sum(mm.amount) AS net FROM clubhost.money_movements mm
        JOIN own_bookings ob ON ob.id=mm.booking_id WHERE ob.batch_id IS NOT NULL GROUP BY mm.booking_id,mm.payer_participant_id
      ), issued AS (
        SELECT COALESCE(ch.booking_id,mv.booking_id) AS booking_id,sum(COALESCE(ch.amount,0)) AS amount,sum(COALESCE(mv.net,0)) AS net,
          sum(greatest(0,COALESCE(ch.amount,0)-COALESCE(mv.net,0))) AS outstanding,
          sum(greatest(0,COALESCE(mv.net,0)-COALESCE(ch.amount,0))) AS credit
        FROM charge_values ch FULL JOIN money_values mv ON ch.booking_id=mv.booking_id AND ch.payer_participant_id IS NOT DISTINCT FROM mv.payer_participant_id
        GROUP BY COALESCE(ch.booking_id,mv.booking_id)
      ), items AS (
        SELECT ob.id,'booking' AS type,ob.title,ob.club_name,ob.starts_at AS date,
          CASE WHEN ob.batch_id IS NOT NULL THEN COALESCE(i.amount,0) WHEN ob.fee_mode='COST_SHARING' THEN NULL ELSE COALESCE(ob.fee_amount,CASE WHEN ob.kind='fixed' THEN ob.fixed_fee ELSE ob.guest_fee END) END AS amount,
          CASE WHEN ob.batch_id IS NOT NULL THEN COALESCE(i.net,0) WHEN ob.paid THEN COALESCE(ob.fee_amount,CASE WHEN ob.kind='fixed' THEN ob.fixed_fee ELSE ob.guest_fee END) ELSE 0 END AS net,
          CASE WHEN ob.batch_id IS NOT NULL THEN COALESCE(i.outstanding,0) WHEN ob.paid OR ob.fee_mode='COST_SHARING' THEN 0 ELSE COALESCE(ob.fee_amount,CASE WHEN ob.kind='fixed' THEN ob.fixed_fee ELSE ob.guest_fee END) END AS outstanding,
          COALESCE(i.credit,0) AS credit,ob.payment_status='reported' AS reported,ob.batch_id IS NOT NULL AS issued
        FROM own_bookings ob LEFT JOIN issued i ON i.booking_id=ob.id WHERE ob.batch_id IS NOT NULL OR (ob.status='confirmed' AND NOT ob.is_cancelled)
        UNION ALL
        SELECT d.id,'due','Phí tháng '||d.period,c.name,d.period,d.amount,CASE WHEN d.paid THEN d.amount ELSE 0 END,
          CASE WHEN d.paid THEN 0 ELSE d.amount END,0,d.payment_status='reported',true
        FROM own_members om JOIN clubhost.monthly_dues d ON d.member_id=om.id JOIN clubhost.clubs c ON c.id=om.club_id
      )
      SELECT json_build_object('total',count(*),'outstanding',COALESCE(sum(outstanding),0),'credit',COALESCE(sum(credit),0),'net',COALESCE(sum(net),0),
        'rows',COALESCE((SELECT json_agg(r) FROM (SELECT * FROM items ORDER BY (outstanding>0) DESC,date DESC,type,id DESC LIMIT 20 OFFSET $2) r),'[]'::json)) AS result FROM items
    `, [accountId, (pageNumber(page) - 1) * 20]);
    return rows[0].result;
  }, { readOnly: true });
}
