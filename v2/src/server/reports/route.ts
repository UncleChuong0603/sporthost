import "server-only";
import { requireHost } from "@/server/auth/service";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { clientIdentity } from "@/server/http";
import { privateHeaders, safeError } from "@/server/errors";
import { workbookResponse } from "./workbook";
export async function exportReport(request: Request, filename: string, build: (hostId: number) => Promise<Buffer>) {
  try {
    const host = await requireHost(); await rateLimit(clientIdentity(request.headers), "excel-export:" + host.id, 12, 60);
    return workbookResponse(await build(host.id), filename);
  } catch (error) { const safe = safeError(error); return Response.json({ error: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
