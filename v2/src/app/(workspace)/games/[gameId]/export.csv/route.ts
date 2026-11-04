import { requireHost } from "@/server/auth/service";
import { sessionCsv } from "@/server/modules/finance/ledger";
import { AppError, safeError, privateHeaders } from "@/server/errors";
export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const gameId = Number((await params).gameId); if (!Number.isSafeInteger(gameId) || gameId < 1) throw new AppError(404, "Không tìm thấy buổi chơi.");
    const data = await sessionCsv((await requireHost()).id, gameId);
    return new Response(data, { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sporthost-game-${gameId}.csv"` } });
  } catch (error) { const safe = safeError(error); return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
