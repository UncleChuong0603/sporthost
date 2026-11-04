import "server-only";
import { and, eq, inArray, desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { gameSessionsInClubhost as sessions, bookingsInClubhost as bookings, membersInClubhost as members, monthlyDuesInClubhost as dues, expensesInClubhost as expenses, bookingParticipantsInClubhost as people } from "@/server/db/schema";
import { listClubs } from "@/server/modules/clubs/service";
import { requireClubAccess } from "@/server/access/permissions";
import { balances, batchFor } from "./queries";
import { periodSchema } from "./club";
import { AppError } from "@/server/errors";
import { genderLabels } from "@/domain/catalog";

export type LedgerRow = { type: "money" | "receivable" | "booking" | "due" | "expense"; id: number; gameId?: number; clubId: number; title: string; description: string; period: string; date: string; amount: number; paid: boolean; status: string; cancelled: boolean; direction: "income" | "expense" };
export function ledgerTotals(rows: LedgerRow[]) {
  return { received: rows.filter(row => row.direction === "income" && row.paid).reduce((sum, row) => sum + row.amount, 0), outstanding: rows.filter(row => row.direction === "income" && !row.paid && !row.cancelled).reduce((sum, row) => sum + row.amount, 0), expenses: rows.filter(row => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0) };
}
export async function financeLedger(hostId: number, clubId?: number, period?: string, status?: string) {
  if (period && !periodSchema.safeParse(period).success) throw new AppError(400, "Kỳ thu chưa hợp lệ.");
  if (clubId !== undefined) await requireClubAccess(getDb(), hostId, clubId, "manage_finance");
  const clubs = (await listClubs(hostId)).filter(club => club.owner || club.rights.includes("manage_finance"));
  const ids = clubs.filter(club => clubId === undefined || club.id === clubId).map(club => club.id);
  const db = getDb(), rows: LedgerRow[] = [];
  if (ids.length) {
    const games = await db.select().from(sessions).where(inArray(sessions.clubId, ids)).orderBy(desc(sessions.startsAt));
    for (const game of games) {
      const base = { gameId: game.id, clubId: game.clubId, period: game.startsAt.slice(0, 7), date: game.startsAt.slice(0, 10), direction: "income" as const };
      if (await batchFor(db, game.id)) {
        for (const payer of await balances(db, game.id)) {
          if (payer.net) rows.push({ ...base, type: "money", id: payer.booking_id, title: payer.name, description: game.title + " · thực nhận sau hoàn", amount: payer.net, paid: true, status: "confirmed", cancelled: false });
          if (payer.outstanding) rows.push({ ...base, type: "receivable", id: payer.booking_id, title: payer.name, description: game.title + " · còn nợ đã phát hành", amount: payer.outstanding, paid: false, status: "unpaid", cancelled: false });
        }
      } else {
        const records = await db.select({ booking: bookings, member: members }).from(bookings).innerJoin(members, eq(members.id, bookings.memberId)).where(eq(bookings.sessionId, game.id));
        for (const { booking, member } of records) {
          if (!["confirmed", "cancelled"].includes(booking.status) && !booking.paid) continue;
          rows.push({ ...base, type: "booking", id: booking.id, title: member.name, description: game.title, amount: booking.feeAmount ?? (member.kind === "fixed" ? game.fixedFee : game.guestFee), paid: booking.paid, status: booking.paymentStatus, cancelled: booking.status === "cancelled" });
        }
      }
      for (const expense of await db.select().from(expenses).where(eq(expenses.sessionId, game.id))) rows.push({ ...base, direction: "expense", type: "expense", id: expense.id, title: expense.title, description: game.title, amount: expense.amount, paid: true, status: "confirmed", cancelled: false });
    }
    for (const { due, member } of await db.select({ due: dues, member: members }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).where(inArray(members.clubId, ids))) rows.push({ type: "due", id: due.id, clubId: member.clubId, title: member.name, description: "Khoản thu theo kỳ " + due.period, period: due.period, date: due.period, amount: due.amount, paid: due.paid, status: due.paymentStatus, cancelled: false, direction: "income" });
  }
  const selected = rows.filter(row => !period || row.period === period).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const totals = ledgerTotals(selected);
  const filtered = selected.filter(row => status === "unpaid" ? row.direction === "income" && !row.paid && !row.cancelled : status === "paid" ? row.direction === "income" && row.paid : status === "expense" ? row.direction === "expense" : true);
  return { clubs, rows: filtered, totals };
}
// Quote all cells and neutralize spreadsheet formula execution in user-controlled text.
export function csv(rows: unknown[][]) {
  return "\ufeff" + rows.map(row => row.map(value => {
    let text = String(value ?? ""); if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) && typeof value !== "number") text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
export async function ledgerCsv(hostId: number, clubId?: number, period?: string, status?: string) {
  const data = await financeLedger(hostId, clubId, period, status);
  return csv([["Ngày/kỳ", "Khoản", "Chi tiết", "Thu/chi", "Số tiền", "Trạng thái"], ...data.rows.map(row => [row.date, row.title, row.description, row.direction === "expense" ? "Chi" : "Thu", row.amount, row.paid ? "Đã ghi nhận" : "Chưa thu"])]);
}
export async function sessionCsv(hostId: number, gameId: number) {
  const db = getDb(); const [game] = await db.select().from(sessions).where(eq(sessions.id, gameId));
  if (!game) throw new AppError(404, "Không tìm thấy buổi chơi.");
  await requireClubAccess(db, hostId, game.clubId, "manage_finance");
  const batch = await batchFor(db, gameId); const issued = batch ? await balances(db, gameId) : null;
  const rows = await db.select({ booking: bookings, member: members }).from(bookings).innerJoin(members, eq(members.id, bookings.memberId)).where(eq(bookings.sessionId, gameId)).orderBy(desc(bookings.id));
  const cells = await Promise.all(rows.map(async ({ booking, member }) => {
    const party = await db.select().from(people).where(eq(people.bookingId, booking.id));
    const fee = issued ? issued.filter(row => row.booking_id === booking.id).reduce((sum, row) => sum + row.amount, 0) : booking.feeAmount ?? (member.kind === "fixed" ? game.fixedFee : game.guestFee);
    return [member.name, member.phone, genderLabels[member.gender as keyof typeof genderLabels], member.kind, member.level, booking.status, fee, booking.paid ? "Có" : "Không", booking.attended ? "Có" : "Không", party.length || 1, party.filter(person => person.position > 0).sort((a, b) => a.position - b.position).map(person => person.name).join("; ")];
  }));
  return csv([["Họ tên", "Số điện thoại", "Giới tính", "Loại", "Trình độ", "Trạng thái", "Phí buổi (VND)", "Đã thu", "Đã điểm danh", "Số người", "Người đi cùng"], ...cells]);
}
