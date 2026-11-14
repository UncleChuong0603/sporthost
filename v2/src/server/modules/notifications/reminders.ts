import "server-only";
import { and, eq, gt, asc, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { transaction } from "@/server/db/client";
import { bookingsInClubhost as bookings, gameSessionsInClubhost as sessions, clubsInClubhost as clubs, hostsInClubhost as accounts, paymentProofsInClubhost as proofs, monthlyDuesInClubhost as dues, membersInClubhost as members } from "@/server/db/schema";
import { memberAccountLinks as links } from "@/server/db/member-schema";
import { reminderSettings as settings, notificationPreferences as preferences, notifications } from "@/server/db/notification-schema";
import { subscriptionState } from "@/domain/subscription";
import { balances, batchFor } from "@/server/modules/finance/queries";
import { bookingNotification, dueNotification } from "./events";

const instant = (value: string | null) => value ? Date.parse(value.length === 16 ? value + ":00+07:00" : value) : NaN;
export function monthlyReminderDue(period: string, day: number, now: Date) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || day < 1 || day > 28) return false;
  return now.valueOf() >= Date.parse(`${period}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
}
export function rsvpReminderDue(game: { startsAt: string; registrationDeadline: string | null; rsvpDeadline: string | null; isOpen: boolean; isCancelled: boolean; lifecycleStatus: string }, leadHours: number, now: Date) {
  const cutoff = Math.min(...[game.startsAt, game.registrationDeadline, game.rsvpDeadline].map(instant).filter(Number.isFinite));
  return game.isOpen && !game.isCancelled && game.lifecycleStatus === "OPEN" && now.valueOf() < cutoff && now.valueOf() >= cutoff - leadHours * 3600000;
}
// Each page commits independently. Unique event keys make concurrent cron runs safe.
// Notifications stay inside SportHost; this worker never sends email or Zalo messages.
export async function runReminderPage(after = 0, now = new Date()) {
  return transaction(async client => {
    const db = drizzle(client);
    const rows = await db.select({ booking: bookings, game: sessions, club: clubs, setting: settings }).from(bookings).innerJoin(sessions, eq(sessions.id, bookings.sessionId)).innerJoin(clubs, eq(clubs.id, sessions.clubId)).innerJoin(settings, eq(settings.clubId, clubs.id)).innerJoin(links, eq(links.memberId, bookings.memberId)).innerJoin(accounts, and(eq(accounts.id, links.accountId), eq(accounts.emailVerified, true))).innerJoin(preferences, and(eq(preferences.accountId, accounts.id), eq(preferences.remindersEnabled, true))).where(and(gt(bookings.id, after), sql`(${settings.rsvpEnabled}=true or ${settings.paymentEnabled}=true)`, sql`not exists (select 1 from clubhost.account_controls c where c.account_id=${accounts.id} and c.suspended=true)`)).orderBy(asc(bookings.id)).limit(100).for("share");
    const monthly = await db.select({ due: dues, club: clubs, setting: settings, accountId: accounts.id }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).innerJoin(clubs, eq(clubs.id, members.clubId)).innerJoin(settings, and(eq(settings.clubId, clubs.id), eq(settings.monthlyEnabled, true))).innerJoin(links, eq(links.memberId, dues.memberId)).innerJoin(accounts, and(eq(accounts.id, links.accountId), eq(accounts.emailVerified, true))).innerJoin(preferences, and(eq(preferences.accountId, accounts.id), eq(preferences.monthlyRemindersEnabled, true))).where(and(gt(dues.id, after), eq(dues.paid, false), gt(dues.amount, 0), sql`${dues.paymentStatus} <> 'reported'`, sql`not exists (select 1 from clubhost.payment_proofs p where p.due_id=${dues.id} and p.status='reported')`, sql`not exists (select 1 from clubhost.account_controls c where c.account_id=${accounts.id} and c.suspended=true)`)).orderBy(asc(dues.id)).limit(100).for("share");
    // One monotonic ID boundary for both tables preserves the deployed cron's
    // existing `after`/`next` contract without skipping a shorter-ID lane.
    const boundaries = [rows.length === 100 ? rows[99].booking.id : Infinity, monthly.length === 100 ? monthly[99].due.id : Infinity];
    const boundary = Math.min(...boundaries), next = Number.isFinite(boundary) ? boundary : null;
    const ledger = new Map<number, Awaited<ReturnType<typeof balances>>>();
    for (const { booking, game, club, setting } of rows.filter(row => row.booking.id <= boundary)) {
      if (!subscriptionState(club, now).active || game.isCancelled) continue;
      if (setting.rsvpEnabled && booking.status === "invited" && rsvpReminderDue(game, setting.rsvpLeadHours, now)) {
        await bookingNotification(db, booking.id, `rsvp:${booking.id}:${game.startsAt}:${game.rsvpDeadline ?? ""}:${game.registrationDeadline ?? ""}`, "rsvp_reminder", now);
      }
      if (!setting.paymentEnabled || !["PLAY_FINISHED", "SETTLED"].includes(game.lifecycleStatus)) continue;
      const batch = await batchFor(db, game.id);
      if (!batch || now.valueOf() < Date.parse(batch.issuedAt) + setting.paymentIntervalDays * 86400000) continue;
      const [pending] = await db.select({ id: proofs.id }).from(proofs).where(and(eq(proofs.bookingId, booking.id), eq(proofs.status, "reported"))).limit(1);
      if (pending) continue;
      const [last] = await db.select({ at: notifications.createdAt }).from(notifications).where(and(eq(notifications.bookingId, booking.id), eq(notifications.kind, "payment_reminder"))).orderBy(desc(notifications.id)).limit(1);
      if (last && now.valueOf() - Date.parse(last.at) < setting.paymentIntervalDays * 86400000) continue;
      if (!ledger.has(game.id)) ledger.set(game.id, await balances(db, game.id));
      if (!ledger.get(game.id)!.some(row => row.booking_id === booking.id && row.outstanding > 0)) continue;
      const bucket = Math.floor((now.valueOf() - Date.parse(batch.issuedAt)) / (setting.paymentIntervalDays * 86400000));
      await bookingNotification(db, booking.id, `payment:${booking.id}:${batch.id}:${setting.paymentIntervalDays}:${bucket}`, "payment_reminder", now);
    }
    for (const { due, club, setting, accountId } of monthly.filter(row => row.due.id <= boundary).sort((a, b) => a.accountId - b.accountId || a.due.id - b.due.id)) {
      if (!subscriptionState(club, now).active || !monthlyReminderDue(due.period, setting.monthlyDay, now)) continue;
      // Serialize per account, not just per debt/profile: multiple overdue
      // months, linked profiles and jobs cannot create a burst for one person.
      await client.query("SELECT pg_advisory_xact_lock(19418,$1)", [accountId]);
      const [last] = await db.select({ at: notifications.createdAt }).from(notifications).where(and(eq(notifications.clubId, club.id), eq(notifications.accountId, accountId), eq(notifications.kind, "monthly_reminder"))).orderBy(desc(notifications.createdAt)).limit(1);
      const interval = setting.monthlyIntervalDays * 86400000;
      if (last && now.valueOf() - Date.parse(last.at) < interval) continue;
      const bucket = Math.floor(now.valueOf() / interval);
      await dueNotification(db, due.id, `monthly:${due.id}:${setting.monthlyIntervalDays}:${bucket}`, "monthly_reminder", now);
    }
    return { scanned: rows.filter(row => row.booking.id <= boundary).length + monthly.filter(row => row.due.id <= boundary).length, next };
  });
}
