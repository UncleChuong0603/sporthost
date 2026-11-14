import "server-only";
import writeExcelFile, { type CellObject, type Sheet } from "write-excel-file/node";
import { AppError, privateHeaders } from "@/server/errors";

export type ReportValue = string | number | Date | null;
export type ReportSheet = { name: string; headers: string[]; rows: ReportValue[][]; widths?: number[] };
export function reportCell(value: ReportValue): CellObject {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AppError(503, "Chưa xuất được số liệu. Vui lòng kiểm tra lại báo cáo.");
    return { type: Number, value, format: "#,##0;[Red]-#,##0" };
  }
  if (value instanceof Date) return { type: Date, value, format: "dd/mm/yyyy" };
  // Explicit String cells never become formulas, even for =/+/@/- prefixes.
  // Strip XML control characters; preserve phone numbers and user-entered text.
  return { type: String, value: (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 32767), format: "@", wrap: true };
}
export async function reportWorkbook(sheets: ReportSheet[]) {
  if (sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 20000) throw new AppError(413, "Báo cáo quá lớn. Hãy chọn một CLB, kỳ hoặc bộ lọc hẹp hơn rồi tải lại.");
  const data: Sheet<never>[] = sheets.map(sheet => ({ sheet: sheet.name, stickyRowsCount: 1, showGridLines: false,
    columns: sheet.headers.map((_, i) => ({ width: sheet.widths?.[i] ?? 24 })),
    data: [sheet.headers.map(title => ({ ...reportCell(title), fontWeight: "bold", backgroundColor: "#087563", textColor: "#ffffff" })), ...sheet.rows.map(row => row.map(reportCell))],
  }));
  return writeExcelFile(data, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
}
export function workbookResponse(bytes: Buffer, filename: string) {
  if (!/^[a-z0-9-]+\.xlsx$/.test(filename)) throw Error("Invalid report filename");
  return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff" } });
}
