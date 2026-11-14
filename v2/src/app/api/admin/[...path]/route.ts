import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import {
  adminList,
  adminDetail,
  adminOverview,
  assertAdmin,
  moduleSchema,
} from "@/server/modules/admin/service";
import { ensureMutation } from "@/server/http";
import { AppError, privateHeaders, safeError } from "@/server/errors";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { runAdminCommand } from "@/server/modules/admin/mutations";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: privateHeaders });
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const actor = await requireHost();
    await assertAdmin(actor.id);
    const { path } = await params;
    const query: Record<string, string> = {};
    for (const [key, value] of request.nextUrl.searchParams) {
      if (key in query) throw new AppError(400, "Bộ lọc trùng lặp.");
      if (value !== "") query[key] = value;
    }
    if (path.length === 1 && path[0] === "overview")
      return json(await adminOverview(actor.id, query));
    if (
      path.length < 1 ||
      path.length > 2 ||
      !moduleSchema.safeParse(path[0]).success
    )
      throw new AppError(404, "Không tìm thấy API quản trị.");
    return json(
      path.length === 2
        ? await adminDetail(actor.id, path[0], path[1])
        : await adminList(actor.id, path[0], query),
    );
  } catch (error) {
    const safe = safeError(error);
    return json({ detail: safe.message, code: safe.code }, safe.status);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    ensureMutation(request.headers);
    const actor = await requireHost();
    await assertAdmin(actor.id);
    ensureCsrf(
      request.headers.get("x-csrf-token") || "",
      await sessionCookie(),
    );
    const { path } = await params;
    if (path.length !== 1 || path[0] !== "commands")
      throw new AppError(404, "Không tìm thấy thao tác quản trị.");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError(415, "Yêu cầu JSON.");
    // Read with a bound instead of buffering an untrusted body in full.
    const reader = request.body?.getReader();
    if (!reader) throw new AppError(400, "Thiếu dữ liệu.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          throw new AppError(413, "Dữ liệu quá lớn.");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AppError(400, "JSON không hợp lệ.");
    }
    await rateLimit(String(actor.id), "admin-write", 20);
    await runAdminCommand(actor.id, raw);
    revalidatePath("/admin", "layout");
    return json({ success: true });
  } catch (error) {
    const safe = safeError(error);
    return json({ detail: safe.message, code: safe.code }, safe.status);
  }
}
