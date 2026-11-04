import "server-only";
import { and, eq, asc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { bookingsInClubhost as bookings, bookingParticipantsInClubhost as people, membersInClubhost as members, monthlyDuesInClubhost as dues, expensesInClubhost as expenses, clubsInClubhost as clubs, chargeBatchesInClubhost as batches, chargesInClubhost as charges, chargeAdjustmentsInClubhost as adjustments, moneyMovementsInClubhost as movements } from "@/server/db/schema";
import { type Game, paymentSnapshot } from "@/server/modules/bookings/core";
import { type BillingPerson, type BillingSnapshot, allocate, fingerprint } from "@/domain/billing";
import { getDb } from "@/server/db/client";
import { gameActor } from "@/server/modules/scheduling/service";

export async function batchFor(db: NodePgDatabase, gameId: number) {
  return (await db.select().from(batches).where(eq(batches.sessionId, gameId)))[0] ?? null;
}
export async function draft(db: NodePgDatabase, game: Game): Promise<BillingSnapshot> {
  const rows = await db.select({ booking: bookings, person: people }).from(bookings).leftJoin(people, eq(people.bookingId, bookings.id)).where(and(eq(bookings.sessionId, game.id), eq(bookings.status, "confirmed"))).orderBy(asc(bookings.id), asc(people.position));
  const memberRows = await db.select().from(members).where(eq(members.clubId, game.clubId));
  const memberMap = new Map(memberRows.map(member => [member.id, member]));
  const paid = new Set((await db.select({ id: dues.memberId }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).where(and(eq(members.clubId, game.clubId), eq(dues.period, game.startsAt.slice(0, 7)), eq(dues.paid, true)))).map(row => row.id));
  const participants: BillingPerson[] = [];
  for (const { booking, person } of rows) {
    if (!person) continue; // Legacy migration creates participant rows; never invent billable people on a read.
    const accepted = JSON.parse(booking.policySnapshot || "{}");
    const member = person.memberId ? memberMap.get(person.memberId) : null;
    let reason = "";
    if (person.chargeExempt) reason = "Miễn phí: " + person.adjustmentReason;
    else if (member?.kind === "fixed" && paid.has(member.id) && (accepted.monthly_policy ?? game.monthlyPolicy) === "EXEMPT_PAID") reason = "Đã đóng phí tháng " + game.startsAt.slice(0, 7);
    else if (person.attendanceStatus === "NO_SHOW" && (accepted.no_show_policy ?? game.noShowPolicy) === "FREE") reason = "Vắng mặt được miễn theo chính sách đã nhận";
    participants.push({ participant_id: person.id, booking_id: booking.id, name: person.name,
      payer_name: booking.payerMode === "GROUP" ? memberMap.get(booking.memberId)!.name : person.name,
      payer_participant_id: booking.payerMode === "GROUP" ? null : person.id,
      attendance: person.attendanceStatus, arrived_at: person.arrivedAt, left_at: person.leftAt,
      unit_price: person.feeAmount, discount: person.feeDiscount, adjustment_reason: person.adjustmentReason,
      exempt: !!reason, explanation: reason, amount: 0 });
  }
  const costs = await db.select().from(expenses).where(eq(expenses.sessionId, game.id)).orderBy(asc(expenses.id));
  const allocated = costs.filter(cost => cost.allocated).reduce((sum, cost) => sum + cost.amount, 0);
  const excluded = costs.filter(cost => !cost.allocated).reduce((sum, cost) => sum + cost.amount, 0);
  const billable = allocate(participants, allocated, game.feeMode);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, game.clubId));
  const advances = (await db.select().from(bookings).where(and(eq(bookings.sessionId, game.id), eq(bookings.paid, true))).orderBy(asc(bookings.id))).map(booking => ({ booking_id: booking.id, name: memberMap.get(booking.memberId)!.name, amount: booking.feeAmount ?? (memberMap.get(booking.memberId)!.kind === "fixed" ? game.fixedFee : game.guestFee) }));
  return { fee_mode: game.feeMode, no_show_policy: game.noShowPolicy, monthly_policy: game.monthlyPolicy,
    people: participants, expenses: costs.map(cost => ({ id: cost.id, title: cost.title, amount: cost.amount, category: cost.category, allocated: cost.allocated, note: cost.note, created_by: cost.createdBy, created_at: cost.createdAt })),
    total_expenses: allocated + excluded, allocated_expenses: allocated, excluded_expenses: excluded,
    total_due: participants.reduce((sum, person) => sum + person.amount, 0), billable_count: billable,
    unmarked: participants.filter(person => person.attendance === "NOT_MARKED").length, payment: paymentSnapshot(club),
    rounding: "EXACT_VND_STABLE_ID", unallocated_cost: billable ? 0 : allocated,
    advances, total_advanced: advances.reduce((sum, advance) => sum + advance.amount, 0) };
}
type Adjustment = typeof adjustments.$inferSelect;
type Movement = typeof movements.$inferSelect;
export type Balance = {
  booking_id: number; payer_participant_id: number | null; name: string; amount: number; received: number; refunded: number; net: number;
  outstanding: number; credit: number; status: string;
  people: { name: string; amount: number; charge_id: number; original_amount: number; adjustments: Adjustment[]; explanation: string }[];
  movements: Movement[];
};
export async function balances(db: NodePgDatabase, gameId: number, bookingId?: number): Promise<Balance[]> {
  const batch = await batchFor(db, gameId); if (!batch) return [];
  const snapshot: BillingSnapshot = JSON.parse(batch.snapshot);
  const names = new Map(snapshot.people.map(person => [person.participant_id, person]));
  const changes = await db.select().from(adjustments).where(eq(adjustments.batchId, batch.id)).orderBy(asc(adjustments.version));
  const rows = new Map<string, Balance>();
  const key = (booking: number, payer: number | null) => `${booking}:${payer ?? "GROUP"}`;
  const addRow = (booking: number, payer: number | null, name: string) => {
    const row: Balance = { booking_id: booking, payer_participant_id: payer, name, amount: 0, received: 0, refunded: 0, net: 0, outstanding: 0, credit: 0, status: "", people: [], movements: [] };
    rows.set(key(booking, payer), row); return row;
  };
  for (const charge of await db.select().from(charges).where(and(eq(charges.batchId, batch.id), bookingId === undefined ? undefined : eq(charges.bookingId, bookingId))).orderBy(asc(charges.id))) {
    const person = names.get(charge.participantId)!;
    const row = rows.get(key(charge.bookingId, charge.payerParticipantId)) ?? addRow(charge.bookingId, charge.payerParticipantId, person.payer_name);
    const prior = changes.filter(change => change.chargeId === charge.id);
    const current = charge.amount + prior.reduce((sum, change) => sum + change.amount, 0);
    row.amount += current; row.people.push({ name: person.name, amount: current, charge_id: charge.id, original_amount: charge.amount, adjustments: prior, explanation: person.explanation });
  }
  const entries = await db.select().from(movements).where(and(eq(movements.sessionId, gameId), bookingId === undefined ? undefined : eq(movements.bookingId, bookingId))).orderBy(asc(movements.id));
  const movementMap = new Map(entries.map(entry => [entry.id, entry]));
  for (const entry of entries) {
    let row = rows.get(key(entry.bookingId, entry.payerParticipantId));
    if (!row) {
      const [member] = await db.select({ name: members.name }).from(bookings).innerJoin(members, eq(members.id, bookings.memberId)).where(eq(bookings.id, entry.bookingId));
      row = addRow(entry.bookingId, entry.payerParticipantId, snapshot.advances?.find(advance => advance.booking_id === entry.bookingId)?.name ?? member.name);
    }
    row.net += entry.amount; row.movements.push(entry);
    if (entry.kind === "RECEIVED") row.received += entry.amount;
    else if (entry.kind === "REFUND_RECORDED") row.refunded -= entry.amount;
    else if (entry.kind === "REVERSAL") {
      const original = entry.reversesId ? movementMap.get(entry.reversesId) : null;
      if (original?.kind === "RECEIVED") row.received += entry.amount;
      else if (original?.kind === "REFUND_RECORDED") row.refunded -= entry.amount;
    }
  }
  for (const row of rows.values()) {
    row.outstanding = Math.max(0, row.amount - row.net); row.credit = Math.max(0, row.net - row.amount);
    row.status = row.credit ? "Thừa / cần hoàn" : !row.outstanding ? "Đã thu đủ" : row.net ? "Đã thu một phần" : "Chưa thu";
  }
  return [...rows.values()];
}
export function summary(rows: Balance[]) {
  return Object.fromEntries((["amount", "received", "refunded", "net", "outstanding", "credit"] as const).map(name => [name, rows.reduce((sum, row) => sum + row[name], 0)])) as Record<"amount" | "received" | "refunded" | "net" | "outstanding" | "credit", number>;
}
export async function financeView(hostId: number, gameId: number) {
  const db = getDb(); const { game, club } = await gameActor(db, hostId, gameId, "manage_finance");
  const batch = await batchFor(db, gameId); const calculation: BillingSnapshot = batch ? JSON.parse(batch.snapshot) : await draft(db, game);
  const payers = await balances(db, gameId);
  return { game: { id: game.id, title: game.title, lifecycleStatus: game.lifecycleStatus, clubId: club.id, clubName: club.name }, batch, calculation, draftHash: fingerprint(calculation), payers, totals: summary(payers) };
}
