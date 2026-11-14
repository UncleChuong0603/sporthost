import { exportReport } from "@/server/reports/route";
import { financeWorkbook, reportId } from "@/server/reports/exports";
export async function GET(request: Request) {
  return exportReport(request, "sporthost-thu-chi.xlsx", hostId => {
    const q = new URL(request.url).searchParams;
    return financeWorkbook(hostId, reportId(q.get("club_id")), q.get("period") || undefined, q.get("status") || undefined);
  });
}
