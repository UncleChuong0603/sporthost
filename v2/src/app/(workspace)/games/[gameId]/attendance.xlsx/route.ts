import { exportReport } from "@/server/reports/route";
import { attendanceWorkbook, reportId } from "@/server/reports/exports";
export async function GET(request: Request, context: { params: Promise<{ gameId: string }> }) {
  return exportReport(request, "sporthost-diem-danh.xlsx", async hostId => attendanceWorkbook(hostId, reportId((await context.params).gameId)));
}
