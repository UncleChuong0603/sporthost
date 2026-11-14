import { exportReport } from "@/server/reports/route";
import { sessionFinanceWorkbook, reportId } from "@/server/reports/exports";
export async function GET(request: Request, context: { params: Promise<{ gameId: string }> }) {
  return exportReport(request, "sporthost-thu-chi-buoi.xlsx", async hostId => sessionFinanceWorkbook(hostId, reportId((await context.params).gameId)));
}
