import { requireHost } from "@/server/auth/service";
import { ledgerCsv } from "@/server/modules/finance/ledger";
import { AppError, safeError, privateHeaders } from "@/server/errors";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams; const clubId = Number(query.get("club_id"));
    if (!Number.isSafeInteger(clubId) || clubId < 1) throw new AppError(400, "Chọn CLB để xuất dữ liệu.");
    const data = await ledgerCsv((await requireHost()).id, clubId, query.get("period") || undefined);
    return new Response(data, { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sporthost-finance.csv"' } });
  } catch (error) { const safe = safeError(error); return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
