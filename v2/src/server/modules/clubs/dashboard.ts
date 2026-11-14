import "server-only";
import { and, eq, inArray, asc, count, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { bookingsInClubhost as bookings, membersInClubhost as members, gameSessionsInClubhost as sessions, paymentProofsInClubhost as proofs, storedAssetsInClubhost as assets, chargeBatchesInClubhost as batches, bookingParticipantsInClubhost as people } from "@/server/db/schema";
import { listClubs } from "./service";
import { listSessions } from "@/server/modules/scheduling/service";
import { financeLedger, ledgerTotals } from "@/server/modules/finance/ledger";
import { localNow } from "@/domain/session-policy";
import { connectionRequests } from "@/server/db/connection-schema";

export async function dashboardData(hostId: number) {
  const clubs = await listClubs(hostId), now = localNow();
  const games = await listSessions(hostId);
  const upcoming = games.filter(game => game.startsAt >= now && !game.isCancelled).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const bookingClubs = clubs.filter(club => club.owner || club.rights.includes("manage_bookings")).map(club => club.id);
  const pending = bookingClubs.length ? await getDb().select({ id: bookings.id, gameId: sessions.id, gameTitle: sessions.title, startsAt: sessions.startsAt, name: members.name, clubId: sessions.clubId }).from(bookings).innerJoin(sessions, eq(sessions.id, bookings.sessionId)).innerJoin(members, eq(members.id, bookings.memberId)).where(and(inArray(sessions.clubId, bookingClubs), eq(bookings.status, "pending"), eq(sessions.isCancelled, false), eq(sessions.attendanceLocked, false), inArray(sessions.lifecycleStatus, ["OPEN", "IN_PROGRESS"]))).orderBy(asc(bookings.id)) : [];
  const financeClubs = clubs.filter(club => club.owner || club.rights.includes("manage_finance")).map(club => club.id);
  const workClubs = clubs.filter(club => club.owner || club.rights.includes("check_in") || club.rights.includes("manage_finance")).map(club => club.id);
  const db = getDb();
  const ownedClubs = clubs.filter(club => club.owner).map(club => club.id);
  const [ledger, proofCounts, finished, connectionCounts] = await Promise.all([
    financeClubs.length ? financeLedger(hostId) : null,
    financeClubs.length ? db.select({ clubId: assets.clubId, total: count() }).from(proofs).innerJoin(assets, eq(assets.id, proofs.assetId)).where(and(inArray(assets.clubId, financeClubs), eq(proofs.status, "reported"))).groupBy(assets.clubId) : [],
    workClubs.length ? db.select({ id: sessions.id, clubId: sessions.clubId, title: sessions.title }).from(sessions).leftJoin(batches, eq(batches.sessionId, sessions.id)).where(and(inArray(sessions.clubId, workClubs), eq(sessions.lifecycleStatus, "PLAY_FINISHED"), eq(sessions.isCancelled, false), eq(sessions.attendanceLocked, false), isNull(batches.id))).orderBy(asc(sessions.startsAt)) : [],
    ownedClubs.length ? db.select({ clubId: connectionRequests.clubId, total: count() }).from(connectionRequests).where(and(inArray(connectionRequests.clubId, ownedClubs), eq(connectionRequests.status, "pending"))).groupBy(connectionRequests.clubId) : [],
  ]);
  const unmarked = finished.length ? await db.select({ gameId: bookings.sessionId, total: count() }).from(people).innerJoin(bookings, eq(bookings.id, people.bookingId)).where(and(inArray(bookings.sessionId, finished.map(game => game.id)), eq(bookings.status, "confirmed"), eq(people.attendanceStatus, "NOT_MARKED"))).groupBy(bookings.sessionId) : [];
  const clubName = (id: number) => clubs.find(club => club.id === id)!.name;
  const work = {
    connections: connectionCounts.map(row => ({ ...row, clubName: clubName(row.clubId) })),
    credits: ledger?.credits.map(row => ({ ...row, clubName: clubName(row.clubId) })) || [],
    proofs: proofCounts.map(row => ({ ...row, clubName: clubName(row.clubId) })),
    sessions: finished.flatMap(game => {
      const remaining = unmarked.find(row => row.gameId === game.id)?.total || 0;
      if (!remaining && !financeClubs.includes(game.clubId)) return [];
      return [{ ...game, clubName: clubName(game.clubId), unmarked: remaining, href: remaining ? `/games/${game.id}#attendance` : `/games/${game.id}/billing` }];
    }),
    receivables: financeClubs.flatMap(clubId => {
      // Draft fees are estimates. Follow only issued debt and explicit monthly dues here.
      const rows = ledger!.rows.filter(row => row.clubId === clubId && ["receivable", "due"].includes(row.type) && !row.paid && !row.cancelled && row.amount > 0);
      return rows.length ? [{ clubId, clubName: clubName(clubId), total: rows.length, amount: rows.reduce((sum, row) => sum + row.amount, 0) }] : [];
    }),
  };
  const financial = ledger ? ledgerTotals(ledger.rows.filter(row => row.period === now.slice(0, 7))) : null;
  return { upcoming: upcoming.slice(0, 5).map(({ id, title, startsAt, venue, clubName, confirmed, capacity }) => ({ id, title, startsAt, venue, clubName, confirmed, capacity })), upcomingCount: upcoming.length, pending, pendingCount: pending.length, financial, work, month: now.slice(0, 7) };
}
