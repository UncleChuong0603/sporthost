import "server-only";
import { eq, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { transaction, getDb } from "@/server/db/client";
import { requireClubAccess } from "@/server/access/permissions";
import { membersInClubhost as members, bookingsInClubhost as bookings, bookingParticipantsInClubhost as people } from "@/server/db/schema";
import { gameActor } from "@/server/modules/scheduling/service";
import { financeLedger, ledgerTotals } from "@/server/modules/finance/ledger";
import { financeView } from "@/server/modules/finance/queries";
import { genderLabels } from "@/domain/catalog";
import { bookingLabels, attendanceLabels } from "@/domain/status";
import { dateTimeText } from "@/domain/format";
import { AppError } from "@/server/errors";
import { reportWorkbook, type ReportSheet } from "./workbook";

export function reportId(raw: string | null) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new AppError(400, "Chọn CLB hoặc buổi chơi hợp lệ để xuất Excel.");
  return value;
}
const gender = (value: string) => genderLabels[value as keyof typeof genderLabels] ?? value;
const excelDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : date;
export async function membersWorkbook(hostId: number, clubId: number, filters: { q?: string; kind?: string; gender?: string } = {}) {
  return transaction(async client => {
    const db = drizzle(client), { club } = await requireClubAccess(db, hostId, clubId, "contacts");
    const rows = await db.select({ name: members.name, phone: members.phone, kind: members.kind, gender: members.gender, level: members.level }).from(members).where(eq(members.clubId, clubId)).orderBy(asc(members.name));
    const q = (filters.q || "").toLocaleLowerCase("vi");
    const selected = rows.filter(row => (!q || (row.name + " " + row.phone).toLocaleLowerCase("vi").includes(q)) && (!filters.kind || row.kind === filters.kind) && (!filters.gender || row.gender === filters.gender));
    return reportWorkbook([{ name: "Thành viên", headers: ["CLB", "Họ tên", "Số điện thoại", "Loại thành viên", "Giới tính", "Trình độ"], rows: selected.map(row => [club.name, row.name, row.phone, row.kind === "fixed" ? "Cố định" : "Vãng lai", gender(row.gender), row.level]), widths: [28, 28, 20, 20, 18, 20] }]);
  }, { readOnly: true });
}
// Deliberately no contact details, capabilities or financial fields in this
// report: check-in-only cohosts can export only the roster they can already see.
async function attendanceSheet(hostId: number, gameId: number, finance = false): Promise<ReportSheet> {
  return transaction(async client => {
    const db = drizzle(client), { game, club } = await gameActor(db, hostId, gameId, finance ? "manage_finance" : "check_in");
    const rows = await db.select({ name: people.name, memberName: members.name, gender: people.gender, level: people.level, status: bookings.status, attendance: people.attendanceStatus, arrived: people.arrivedAt, left: people.leftAt }).from(bookings).innerJoin(members, eq(members.id, bookings.memberId)).leftJoin(people, eq(bookings.id, people.bookingId)).where(eq(bookings.sessionId, game.id)).orderBy(asc(bookings.id), asc(people.position));
    return { name: "Điểm danh", headers: ["CLB", "Buổi chơi", "Giờ chơi (UTC+7)", "Họ tên", "Giới tính", "Trình độ", "Đăng ký", "Điểm danh", "Đến sân (UTC+7)", "Về (UTC+7)"], rows: rows.map(row => [club.name, game.title, dateTimeText(game.startsAt), row.name ?? row.memberName, row.gender ? gender(row.gender) : "", row.level ?? "", bookingLabels[row.status] ?? row.status, row.attendance ? (attendanceLabels[row.attendance] ?? row.attendance) : "Đăng ký cũ — chưa có danh sách chi tiết", row.arrived ? dateTimeText(row.arrived) : "", row.left ? dateTimeText(row.left) : ""]) };
  }, { readOnly: true });
}
export async function attendanceWorkbook(hostId: number, gameId: number) { return reportWorkbook([await attendanceSheet(hostId, gameId)]); }
export async function sessionFinanceWorkbook(hostId: number, gameId: number) {
  const view = await financeView(hostId, gameId), { batch, calculation, payers, totals } = view;
  const summary: ReportSheet = { name: "Tổng quan", headers: ["Mục", "Giá trị"], rows: [["CLB", view.game.clubName], ["Buổi chơi", view.game.title], ["Trạng thái phí", batch ? "Đã phát hành" : "Bản nháp — chưa phát hành"], ["Tổng chi phí (đ)", calculation.total_expenses], ["Phải đóng (đ)", batch ? totals.amount : calculation.total_due], [batch ? "Thực nhận sau hoàn (đ)" : "Đã thu trước (đ)", batch ? totals.net : calculation.total_advanced], ["Còn cần thu đã phát hành (đ)", batch ? totals.outstanding : 0], ["Tiền thừa / cần xử lý (đ)", batch ? totals.credit : 0]], widths: [42, 50] };
  const balances: ReportSheet = { name: "Khoản đóng", headers: ["Người thanh toán", "Phải đóng (đ)", "Đã nhận sau hoàn tác (đ)", "Đã hoàn sau hoàn tác (đ)", "Thực nhận sau hoàn (đ)", "Còn thu (đ)", "Tiền thừa (đ)", "Trạng thái"], rows: payers.map(p => [p.name, p.amount, p.received, p.refunded, p.net, p.outstanding, p.credit, p.status]) };
  const draft: ReportSheet = { name: "Bản tính phí", headers: ["Người chơi", "Số tiền trong bản phát hành/nháp (đ)", "Giải thích"], rows: calculation.people.map(p => [p.name, p.amount, p.explanation]), widths: [28, 34, 65] };
  const costs: ReportSheet = { name: "Chi phí", headers: ["Nội dung", "Số tiền (đ)", "Phân bổ", "Ghi chú"], rows: calculation.expenses.map(c => [c.title, c.amount, c.allocated ? "Chia cho người chơi" : "CLB chi, không chia", c.note]) };
  const money: ReportSheet = { name: "Giao dịch", headers: ["Người thanh toán", "Loại", "Số tiền có dấu (đ)", "Kênh", "Thời điểm (UTC+7)", "Tham chiếu", "Lý do"], rows: payers.flatMap(p => p.movements.map(m => [p.name, m.kind === "RECEIVED" ? "Thu" : m.kind === "REFUND_RECORDED" ? "Hoàn tiền" : "Hoàn tác", m.amount, m.source === "CASH" ? "Tiền mặt" : m.source === "BANK_TRANSFER" ? "Chuyển khoản" : "Khác", dateTimeText(m.occurredAt), m.reference, m.reason])) };
  const bytes = await reportWorkbook([summary, balances, draft, costs, money, await attendanceSheet(hostId, gameId, true)]);
  await gameActor(getDb(), hostId, gameId, "manage_finance");
  return bytes;
}
export async function financeWorkbook(hostId: number, clubId: number, period?: string, status?: string) {
  if (status && !["paid", "unpaid", "expense"].includes(status)) throw new AppError(400, "Bộ lọc trạng thái chưa hợp lệ.");
  const data = await financeLedger(hostId, clubId, period, status), totals = ledgerTotals(data.rows);
  const club = data.clubs.find(c => c.id === clubId)!;
  const headers = ["Ngày/kỳ", "Khoản", "Chi tiết", "Thu/chi", "Số tiền (đ)", "Trạng thái"];
  const rows = data.rows.map(row => [excelDate(row.date), row.title, row.description, row.direction === "expense" ? "Chi" : "Thu", row.amount, row.cancelled ? "Đã hủy" : row.paid ? "Đã ghi nhận" : row.status === "reported" ? "Chờ đối soát" : "Cần thu"]);
  const bytes = await reportWorkbook([
    { name: "Tổng quan", headers: ["Mục", "Giá trị"], rows: [["CLB", club.name], ["Kỳ", period || "Tất cả"], ["Trạng thái lọc", status === "paid" ? "Đã ghi nhận" : status === "unpaid" ? "Cần thu" : status === "expense" ? "Khoản chi" : "Tất cả"], ["Phạm vi tổng", "Các dòng đã lọc trong sheet Thu chi"], ["Đã ghi nhận (đ)", totals.received], ["Còn cần thu (đ)", totals.outstanding], ["Chi phí (đ)", totals.expenses]], widths: [32, 60] },
    { name: "Thu chi", headers, rows },
    { name: "Công nợ", headers, rows: data.rows.flatMap((row, i) => row.direction === "income" && !row.paid && !row.cancelled ? [rows[i]] : []) },
    { name: "Tiền thừa", headers: ["Người thanh toán", "Buổi chơi", "Kỳ", "Tiền thừa (đ)", "Phạm vi"], rows: data.credits.map(c => [c.name, c.gameTitle, c.period, c.amount, "Theo kỳ đã chọn, không lọc trạng thái"]) },
  ]);
  await requireClubAccess(getDb(), hostId, clubId, "manage_finance");
  return bytes;
}
