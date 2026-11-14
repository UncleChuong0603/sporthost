import "server-only";
import { and, eq, desc, isNull, lt, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { notifications as notices, notificationPreferences as preferences, reminderSettings as settings } from "@/server/db/notification-schema";
import { clubsInClubhost as clubs, hostsInClubhost as accounts } from "@/server/db/schema";
import { requireActiveAccount } from "@/server/auth/account-status";
import { requireClubAccess } from "@/server/access/permissions";
import { requirePro } from "@/server/modules/subscriptions/entitlements";
import { AppError } from "@/server/errors";

// A removed/reassigned link also removes access to historical notification content.
const visible = (accountId: number) => and(eq(notices.accountId, accountId), sql`exists (select 1 from clubhost.member_account_links l join clubhost.hosts a on a.id=l.account_id join clubhost.members m on m.id=l.member_id where l.member_id=${notices.memberId} and l.account_id=${accountId} and a.email_verified=true and m.club_id=${notices.clubId} and l.linked_at<=${notices.createdAt})`);
export async function unreadCount(accountId: number) {
  const db = getDb(); await requireActiveAccount(db, accountId);
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(notices).where(and(visible(accountId), isNull(notices.readAt)));
  return row.count;
}
export async function notificationInbox(accountId: number, before?: number) {
  const db = getDb(); await requireActiveAccount(db, accountId);
  const rows = await db.select({ id: notices.id, title: notices.title, kind: notices.kind, createdAt: notices.createdAt, readAt: notices.readAt, bookingId: notices.bookingId, dueId: notices.dueId, clubName: clubs.name }).from(notices).innerJoin(clubs, eq(clubs.id, notices.clubId)).where(and(visible(accountId), before ? lt(notices.id, before) : undefined)).orderBy(desc(notices.id)).limit(21);
  const [preference] = await db.select().from(preferences).where(eq(preferences.accountId, accountId));
  return { rows: rows.slice(0, 20).map(row => ({ ...row, href: row.bookingId ? `/me/bookings/${row.bookingId}` : `/me/dues/${row.dueId}` })), next: rows.length > 20 ? rows[19].id : null, remindersEnabled: preference?.remindersEnabled ?? false };
}
export async function markNotificationsRead(accountId: number) {
  return transaction(async client => {
    const db = drizzle(client); await requireActiveAccount(db, accountId);
    await db.update(notices).set({ readAt: new Date().toISOString() }).where(and(visible(accountId), isNull(notices.readAt)));
  });
}
export async function setReminderPreference(accountId: number, enabled: boolean) {
  return transaction(async client => {
    const db = drizzle(client); await requireActiveAccount(db, accountId);
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (enabled && !account.emailVerified) throw new AppError(403, "Xác minh email trước khi bật nhắc việc.");
    await db.insert(preferences).values({ accountId, remindersEnabled: enabled, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: preferences.accountId, set: { remindersEnabled: enabled, updatedAt: new Date().toISOString() } });
  });
}
const settingSchema = z.object({ rsvpEnabled: z.boolean(), paymentEnabled: z.boolean(), rsvpLeadHours: z.coerce.number().int().min(1).max(168), paymentIntervalDays: z.coerce.number().int().min(1).max(14) });
export async function clubReminderSettings(hostId: number, clubId: number, db: NodePgDatabase = getDb()) {
  const { club } = await requireClubAccess(db, hostId, clubId, "owner");
  const [value] = await db.select().from(settings).where(eq(settings.clubId, clubId));
  return { club, value: value ?? { rsvpEnabled: false, paymentEnabled: false, rsvpLeadHours: 24, paymentIntervalDays: 3 } };
}
export async function saveClubReminders(hostId: number, clubId: number, raw: unknown) {
  const parsed = settingSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Nhắc RSVP trước 1–168 giờ; nhắc khoản đóng mỗi 1–14 ngày.");
  return transaction(async client => {
    const db = drizzle(client);
    const { club } = await clubReminderSettings(hostId, clubId, db);
    if (parsed.data.rsvpEnabled || parsed.data.paymentEnabled) requirePro(club);
    const value = { ...parsed.data, updatedAt: new Date().toISOString() };
    await db.insert(settings).values({ clubId, ...value }).onConflictDoUpdate({ target: settings.clubId, set: value });
  });
}
