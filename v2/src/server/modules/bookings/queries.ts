import "server-only";
import { eq, asc, and } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { gameSessionsInClubhost as sessions, clubsInClubhost as clubs, bookingsInClubhost as bookings, membersInClubhost as members, paymentProofsInClubhost as proofs } from "@/server/db/schema";
import { gameActor } from "@/server/modules/scheduling/service";
import { guestContext, type GuestOwner } from "./guest";
import { participants, seatCounts, bookedPolicy, allowGuestChange, type Game } from "./core";
import { guestToken } from "@/server/compatibility/guest-capability";
import { getConfig } from "@/server/config";
import { hasPermission } from "@/server/access/permissions";
import { guestOpen, registrationOpen } from "@/domain/session-policy";
import { AppError } from "@/server/errors";
import { balances, batchFor } from "@/server/modules/finance/queries";
import type { BillingSnapshot } from "@/domain/billing";

export function publicGameFields(game: Game) {
  return { id: game.id, publicId: game.publicId, title: game.title, venue: game.venue, startsAt: game.startsAt, capacity: game.capacity, capacityMale: game.capacityMale, capacityFemale: game.capacityFemale, fixedFee: game.fixedFee, guestFee: game.guestFee, fixedFeeMale: game.fixedFeeMale, fixedFeeFemale: game.fixedFeeFemale, guestFeeMale: game.guestFeeMale, guestFeeFemale: game.guestFeeFemale, approvalMode: game.approvalMode, sport: game.sportSnapshot, skillGuidance: game.skillGuidance, venueInstructions: game.venueInstructions, cancellationPolicy: game.cancellationPolicy, participationConditions: game.participationConditions, mapsUrl: game.mapsUrl, registrationDeadline: game.registrationDeadline, cancellationDeadline: game.cancellationDeadline, lifecycleStatus: game.lifecycleStatus, feeMode: game.feeMode, noShowPolicy: game.noShowPolicy, monthlyPolicy: game.monthlyPolicy, isCancelled: game.isCancelled, attendanceLocked: game.attendanceLocked };
}
export async function publicSession(publicId: string, owner: GuestOwner) {
  const db = getDb(); const [game] = await db.select().from(sessions).where(eq(sessions.publicId, publicId));
  if (!game) throw new AppError(404, "Không tìm thấy buổi chơi.");
  const [club] = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, game.clubId));
  const counts = await seatCounts(db, game.id); let own: { key: string; status: string } | null = null;
  if (owner) {
    try { const context = await guestContext(db, owner.key); if (context.booking.id === owner.booking && context.game.id === game.id) own = { key: owner.key, status: context.booking.status }; }
    catch (error) { if (!(error instanceof AppError && error.status === 404)) throw error; }
  }
  return { ...publicGameFields(game), clubName: club.name, confirmed: Object.values(counts).reduce((a, b) => a + b, 0), guestOpen: guestOpen(game), registrationOpen: registrationOpen(game), own };
}
export async function hostSession(hostId: number, gameId: number) {
  const db = getDb(); const { game, club, owner, rights } = await gameActor(db, hostId, gameId, "view");
  const finance = hasPermission(owner, rights, "manage_finance"), contacts = hasPermission(owner, rights, "contacts"), manage = hasPermission(owner, rights, "manage_bookings");
  const issued = finance && !!await batchFor(db, game.id); const accounts = issued ? await balances(db, game.id) : [];
  const rows = await db.select({ booking: bookings, member: members }).from(bookings).innerJoin(members, eq(members.id, bookings.memberId)).where(eq(bookings.sessionId, game.id)).orderBy(asc(bookings.id));
  const roster = await Promise.all(rows.map(async ({ booking, member }) => {
    const party = await participants(db, booking.id);
    const activeLink = manage && !booking.tokenRevoked && booking.tokenExpiresAt && Date.parse(booking.tokenExpiresAt) > Date.now() ? booking.tokenNonce ? guestToken(booking.tokenNonce, getConfig().SECRET_KEY) : booking.accessKey || null : null;
    return { id: booking.id, name: member.name, phone: contacts ? member.phone : null, kind: member.kind, status: booking.status, decisionReason: booking.decisionReason, channel: booking.channel, privateKey: activeLink,
      fee: finance ? issued ? accounts.filter(row => row.booking_id === booking.id).reduce((sum, row) => sum + row.amount, 0) : booking.feeAmount ?? (member.kind === "fixed" ? game.fixedFee : game.guestFee) : null, paymentStatus: finance ? booking.paymentStatus : null, paid: finance ? booking.paid : null,
      participants: party.map(person => ({ id: person.id, name: person.name, gender: person.gender, level: person.level, attendanceStatus: person.attendanceStatus, arrivedAt: person.arrivedAt, leftAt: person.leftAt, version: person.attendanceVersion })) };
  }));
  const fixed = manage ? await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.clubId, club.id), eq(members.kind, "fixed"))).orderBy(asc(members.name)) : [];
  const publicFields = publicGameFields(game);
  return { ...publicFields, fixedFee: finance ? game.fixedFee : null, guestFee: finance ? game.guestFee : null, fixedFeeMale: finance ? game.fixedFeeMale : null, fixedFeeFemale: finance ? game.fixedFeeFemale : null, guestFeeMale: finance ? game.guestFeeMale : null, guestFeeFemale: finance ? game.guestFeeFemale : null, clubId: club.id, clubName: club.name, owner, rights, canFinance: finance, canBookings: manage, canCheckIn: hasPermission(owner, rights, "check_in"), canSession: hasPermission(owner, rights, "manage_session"), isOpen: game.isOpen, roster, fixed, confirmed: Object.values(await seatCounts(db, game.id)).reduce((a, b) => a + b, 0) };
}
export async function guestBooking(key: string) {
  const db = getDb(); const { game, booking, member, club } = await guestContext(db, key);
  let editable = false, cancellable = false;
  try { await allowGuestChange(db, booking, game); editable = member.kind === "guest" && !["cancelled", "rejected", "invited"].includes(booking.status); } catch (error) { if (!(error instanceof AppError)) throw error; }
  try { await allowGuestChange(db, booking, game, false); cancellable = booking.status !== "cancelled"; } catch (error) { if (!(error instanceof AppError)) throw error; }
  const party = await participants(db, booking.id);
  const issued = !!await batchFor(db, game.id);
  const feeAmount = issued ? (await balances(db, game.id, booking.id)).reduce((sum, row) => sum + row.amount, 0) : booking.feeAmount ?? (member.kind === "fixed" ? game.fixedFee : game.guestFee);
  return { ...publicGameFields(game), clubName: club.name, bookingId: booking.id, name: member.name, phone: member.phone, kind: member.kind, status: booking.status, issued, feeAmount, paymentStatus: booking.paymentStatus, paid: booking.paid, payerMode: booking.payerMode, editable, cancellable, policy: bookedPolicy(booking, game), participants: party.map(p => ({ id: p.id, name: p.name, gender: p.gender, level: p.level, attendanceStatus: p.attendanceStatus })) };
}

export async function guestFinance(key: string) {
  const db = getDb(); const { booking, game, club } = await guestContext(db, key);
  const batch = await batchFor(db, game.id);
  const saved = JSON.parse(booking.paymentSnapshot || "{}");
  const payment: BillingSnapshot["payment"] = batch ? JSON.parse(batch.snapshot).payment : Object.keys(saved).length ? saved : booking.qrKey && booking.qrKey !== club.qrKey ? { qr_key: null, bank_name: "", account_holder: "", account_number: "", payment_note: "" } : { qr_key: club.qrKey, bank_name: club.bankName, account_holder: club.accountHolder, account_number: club.accountNumber, payment_note: club.paymentNote };
  const rows = batch ? await balances(db, game.id, booking.id) : [];
  const reports = await db.select({ id: proofs.id, status: proofs.status, note: proofs.note, createdAt: proofs.createdAt }).from(proofs).where(eq(proofs.bookingId, booking.id));
  const canReport = !game.isCancelled && booking.status === "confirmed" && (!!batch || (game.feeMode !== "COST_SHARING" && !booking.paid && booking.paymentStatus !== "refunded" && !reports.some(report => report.status === "reported")));
  return { issued: !!batch, payerMode: booking.payerMode, canChoosePayer: !batch && !game.isCancelled && !game.attendanceLocked && booking.status === "confirmed",
    canReport, reports,
    payment: { bankName: payment.bank_name, accountHolder: payment.account_holder, accountNumber: payment.account_number, note: payment.payment_note, qrAvailable: !!payment.qr_key },
    payers: rows.map(row => ({ name: row.name, amount: row.amount, net: row.net, outstanding: row.outstanding, credit: row.credit, status: row.status, payerParticipantId: row.payer_participant_id,
      people: row.people.map(person => ({ name: person.name, amount: person.amount, explanation: person.explanation })),
      movements: row.movements.map(entry => ({ id: entry.id, amount: entry.amount, kind: entry.kind, source: entry.source, occurredAt: entry.occurredAt })) })) };
}
