"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { ensureMutation } from "@/server/http";
import { assertAdmin } from "@/server/modules/admin/service";
import { runAdminCommand } from "@/server/modules/admin/mutations";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { safeError } from "@/server/errors";
export async function executeAdmin(
  _state: { error?: string; success?: string },
  form: FormData,
): Promise<{ error?: string; success?: string }> {
  try {
    ensureMutation(await headers());
    ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const host = await requireHost();
    await assertAdmin(host.id);
    await rateLimit(String(host.id), "admin-write", 20);
    await runAdminCommand(host.id, {
      action: form.get("action"),
      targetId: form.get("targetId"),
      version: form.get("version"),
      reason: form.get("reason"),
      days: form.get("days") || undefined,
      orderCode: form.get("orderCode") || "",
      confirmed: form.get("confirmed") === "yes",
    });
    revalidatePath("/admin", "layout");
    return { success: "Đã lưu thay đổi và ghi nhật ký quản trị." };
  } catch (error) {
    return { error: safeError(error).message };
  }
}
