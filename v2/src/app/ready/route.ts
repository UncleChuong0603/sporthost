import { transaction } from "@/server/db/client";
import { privateHeaders } from "@/server/errors";
import { assertReady } from "@/server/readiness";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await transaction(assertReady, { readOnly: true });
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch { return Response.json({ detail: "Database not ready" }, { status: 503, headers: privateHeaders }); }
}
