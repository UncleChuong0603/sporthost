import { exportReport } from "@/server/reports/route";
import { membersWorkbook, reportId } from "@/server/reports/exports";
export async function GET(request: Request) {
  return exportReport(request, "sporthost-thanh-vien.xlsx", hostId => {
    const q = new URL(request.url).searchParams;
    return membersWorkbook(hostId, reportId(q.get("club_id")), { q: q.get("q") || undefined, kind: q.get("kind") || undefined, gender: q.get("gender") || undefined });
  });
}
