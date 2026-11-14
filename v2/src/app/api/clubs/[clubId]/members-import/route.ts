import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { clientIdentity, ensureMutation } from "@/server/http";
import { privateHeaders, safeError, AppError } from "@/server/errors";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { boundedForm } from "@/server/bounded-form";
import { maxExcelBytes } from "@/server/modules/members/xlsx";
import { membersExcelImport } from "@/server/modules/members/import";
export async function POST(request: Request, context: { params: Promise<{ clubId: string }> }) {
  try {
    ensureMutation(request.headers); ensureCsrf(request.headers.get("x-csrf-token") || "", await sessionCookie());
    const host = await requireHost();
    await rateLimit(clientIdentity(request.headers), "members-excel:" + host.id, 12, 60);
    const form = await boundedForm(request, maxExcelBytes + 65536), file = form.get("file"), mode = form.get("mode");
    if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || !file.size) throw new AppError(400, "Chọn file Excel .xlsx. Nếu đang dùng .xls, hãy Lưu thành .xlsx trong Excel.");
    if (file.size > maxExcelBytes) throw new AppError(413, "File tối đa 2 MB.");
    if (!["preview", "commit"].includes(String(mode)) || mode === "commit" && typeof form.get("token") !== "string") throw new AppError(400, "Hãy xem trước file trước khi nhập.");
    const result = await membersExcelImport(host.id, Number((await context.params).clubId), Buffer.from(await file.arrayBuffer()), mode === "commit" ? String(form.get("token")) : undefined);
    if (mode === "commit") { revalidatePath("/members"); revalidatePath("/dashboard"); }
    return Response.json(result, { headers: privateHeaders });
  } catch (error) { const safe = safeError(error); return Response.json({ error: safe.message }, { status: safe.status, headers: privateHeaders }); }
}
