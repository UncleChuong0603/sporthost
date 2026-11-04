"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureMutation } from "@/server/http";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { requireHost } from "@/server/auth/service";
import { saveMember } from "@/server/modules/members/service";
import { safeError, AppError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";
import { linkMemberAccount, unlinkMemberAccount } from "@/server/modules/member-portal/service";

export async function memberAccount(clubId: number, memberId: number, command: "link" | "unlink", _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const owner = await requireHost();
    if (command !== "link" && command !== "unlink") throw new AppError(400, "Thao tác liên kết không hợp lệ.");
    if (command === "link") await linkMemberAccount(owner.id, clubId, memberId, String(form.get("email") || ""));
    else await unlinkMemberAccount(owner.id, clubId, memberId);
    revalidatePath("/members"); revalidatePath("/me", "layout");
    return { success: command === "link" ? "Đã liên kết tài khoản người chơi." : "Đã gỡ liên kết. Tài khoản không còn truy cập hồ sơ này." };
  } catch (error) { return { error: safeError(error).message }; }
}
export async function addMember(clubId: number, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const host = await requireHost();
    await saveMember(host.id, clubId, null, Object.fromEntries(form));
    revalidatePath("/members"); return { success: "Đã thêm thành viên." };
  } catch (error) { return { error: safeError(error).message }; }
}

export async function editMember(clubId: number, memberId: number, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    await saveMember((await requireHost()).id, clubId, memberId, Object.fromEntries(form));
    revalidatePath("/members"); revalidatePath(`/clubs/${clubId}`); return { success: "Đã cập nhật thành viên." };
  } catch (error) { return { error: safeError(error).message }; }
}
