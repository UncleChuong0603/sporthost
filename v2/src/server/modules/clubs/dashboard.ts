import "server-only";
import { and, eq, inArray, asc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { bookingsInClubhost as bookings, membersInClubhost as members, gameSessionsInClubhost as sessions } from "@/server/db/schema";
import { listClubs } from "./service";
import { listSessions } from "@/server/modules/scheduling/service";
import { financeLedger } from "@/server/modules/finance/ledger";
import { localNow } from "@/domain/session-policy";

export async function dashboardData(hostId: number, authorizedClubs?: Awaited<ReturnType<typeof listClubs>>) {
  const clubs = authorizedClubs ?? await listClubs(hostId), now = localNow();
  const games = await listSessions(hostId);
  const upcoming = games.filter(game => game.startsAt >= now && !game.isCancelled).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const bookingClubs = clubs.filter(club => club.owner || club.rights.includes("manage_bookings")).map(club => club.id);
  const pending = bookingClubs.length ? await getDb().select({ id: bookings.id, gameId: sessions.id, gameTitle: sessions.title, startsAt: sessions.startsAt, name: members.name, clubId: sessions.clubId }).from(bookings).innerJoin(sessions, eq(sessions.id, bookings.sessionId)).innerJoin(members, eq(members.id, bookings.memberId)).where(and(inArray(sessions.clubId, bookingClubs), eq(bookings.status, "pending"))).orderBy(asc(bookings.id)) : [];
  const canFinance = clubs.some(club => club.owner || club.rights.includes("manage_finance"));
  const financial = canFinance ? (await financeLedger(hostId, undefined, now.slice(0, 7))).totals : null;
  return { upcoming: upcoming.slice(0, 5).map(({ id, title, startsAt, venue, clubName, confirmed, capacity }) => ({ id, title, startsAt, venue, clubName, confirmed, capacity })), upcomingCount: upcoming.length, pending: pending.slice(0, 5), pendingCount: pending.length, financial, month: now.slice(0, 7) };
}
