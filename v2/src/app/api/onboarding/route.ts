import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { clientIdentity, ensureMutation } from "@/server/http";
import { privateHeaders, safeError, AppError } from "@/server/errors";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { onboardingSnapshot, onboardingSessionSnapshot, updateOnboarding } from "@/server/modules/onboarding/service";

export async function GET(request: Request) {
  try {
    const host = await requireHost();
    const query = new URL(request.url).searchParams, raw = query.get("club_id"), session = query.get("session_id");
    if (session) return Response.json(await onboardingSessionSnapshot(host.id, Number(session)), { headers: privateHeaders });
    return Response.json(await onboardingSnapshot(host.id, raw ? Number(raw) : undefined), { headers: privateHeaders });
  } catch (error) { const safe = safeError(error); return Response.json({ error: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
export async function POST(request: Request) {
  try {
    ensureMutation(request.headers); ensureCsrf(request.headers.get("x-csrf-token") || "", await sessionCookie());
    const host = await requireHost();
    await rateLimit(clientIdentity(request.headers), "onboarding:" + host.id, 90, 60);
    if (Number(request.headers.get("content-length") || 0) > 2048) throw new AppError(413, "Yêu cầu hướng dẫn quá lớn.");
    let body: unknown; try { const text = await request.text(); if (text.length > 2048) throw Error(); body = JSON.parse(text); } catch { throw new AppError(400, "Yêu cầu hướng dẫn chưa hợp lệ."); }
    return Response.json(await updateOnboarding(host.id, body), { headers: privateHeaders });
  } catch (error) { const safe = safeError(error); return Response.json({ error: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
