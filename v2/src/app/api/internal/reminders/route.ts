import { timingSafeEqual, createHash } from "node:crypto";
import { getConfig } from "@/server/config";
import { privateHeaders, safeError } from "@/server/errors";
import { runReminderPage } from "@/server/modules/notifications/reminders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const config = getConfig();
  const provided = request.headers.get("authorization") || "";
  const secret = config.REMINDER_CRON_SECRET;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!secret || !timingSafeEqual(hash(provided), hash(`Bearer ${secret}`))) return Response.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  const cursor = Number(new URL(request.url).searchParams.get("after") || 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > 2147483647) return Response.json({ error: "invalid_cursor" }, { status: 400, headers: privateHeaders });
  try { return Response.json(await runReminderPage(cursor), { headers: privateHeaders }); }
  catch (error) { const safe = safeError(error); return Response.json({ error: safe.code, detail: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
