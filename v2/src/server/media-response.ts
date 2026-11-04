import "server-only";
import { privateHeaders, safeError } from "./errors";

export async function mediaResponse(load: () => Promise<Buffer>) {
  try {
    return new Response(new Uint8Array(await load()), { headers: { ...privateHeaders, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="image.png"' } });
  } catch (error) { const safe = safeError(error); return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
