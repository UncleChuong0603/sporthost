"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureMutation } from "@/server/http";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { requireHost } from "@/server/auth/service";
import { createClub, updateClub } from "@/server/modules/clubs/service";
import { safeError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";
import { grantAccess, revokeAccess } from "@/server/modules/clubs/access";

export async function saveClub(id: number | null, _state: FormState, form: FormData): Promise<FormState> {
  let target = id;
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const host = await requireHost();
    const raw = Object.fromEntries([...form].filter(([key]) => !key.startsWith("$") && key !== "csrf"));
    if (id) await updateClub(host.id, id, raw); else target = (await createClub(host.id, raw)).id;
    revalidatePath("/dashboard"); revalidatePath("/clubs");
    if (id) { revalidatePath(`/clubs/${id}`); return { success: "Đã lưu cài đặt câu lạc bộ." }; }
  } catch (error) { return { error: safeError(error).message }; }
  redirect(`/clubs/${target}`);
}

export async function saveAccess(clubId: number, accessId: number | null, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const host = await requireHost();
    if (accessId) await revokeAccess(host.id, clubId, accessId);
    else await grantAccess(host.id, clubId, String(form.get("email") || ""), String(form.get("role") || ""), form.getAll("permissions").map(String));
    revalidatePath(`/clubs/${clubId}`); revalidatePath(`/clubs/${clubId}/settings`);
    return { success: accessId ? "Đã thu hồi quyền." : "Đã lưu quyền đồng quản lý." };
  } catch (error) { return { error: safeError(error).message }; }
}
