"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { clientIdentity, ensureMutation } from "@/server/http";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { safeError } from "@/server/errors";
import { cancelConnection, changeConnectionInvite, connectionCode, requestConnection, reviewConnection } from "@/server/modules/member-portal/connections";
import type { FormState } from "@/features/clubs/settings-form";

async function actor(form: FormData) {
  const h = await headers(); ensureMutation(h); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
  const account = await requireHost();
  await rateLimit(clientIdentity(h), "club-connections:" + account.id, 30, 60);
  return account.id;
}
function refresh(clubId?: number) {
  revalidatePath("/me", "layout"); revalidatePath("/members"); revalidatePath("/dashboard");
  if (clubId) revalidatePath(`/clubs/${clubId}/connections`);
}
export async function openConnection(_state: FormState, form: FormData): Promise<FormState> {
  let code: string;
  try { await actor(form); code = connectionCode(String(form.get("code") || "")); }
  catch (error) { return { error: safeError(error).message }; }
  redirect(`/me/connect/${code}`);
}
export async function submitConnection(code: string, _state: FormState, form: FormData): Promise<FormState> {
  try {
    await requestConnection(await actor(form), code, { name: String(form.get("name") || ""), note: String(form.get("note") || "") });
    refresh(); return { success: "Đã gửi yêu cầu. Chủ CLB sẽ kiểm tra và liên kết đúng hồ sơ của bạn." };
  } catch (error) { return { error: safeError(error).message }; }
}
export async function withdrawConnection(id: number, _state: FormState, form: FormData): Promise<FormState> {
  try { await cancelConnection(await actor(form), id); refresh(); return { success: "Đã rút yêu cầu kết nối." }; }
  catch (error) { return { error: safeError(error).message }; }
}
export async function inviteCommand(clubId: number, command: "rotate" | "disable", _state: FormState, form: FormData): Promise<FormState> {
  try { await changeConnectionInvite(await actor(form), clubId, command); refresh(clubId); return { success: command === "rotate" ? "Đã cấp liên kết mời mới. Liên kết cũ không nhận thêm yêu cầu." : "Đã tắt liên kết mời. Các yêu cầu đã gửi vẫn chờ bạn xử lý." }; }
  catch (error) { return { error: safeError(error).message }; }
}
export async function reviewCommand(clubId: number, requestId: number, command: "approve" | "reject", _state: FormState, form: FormData): Promise<FormState> {
  try {
    await reviewConnection(await actor(form), clubId, requestId, command, form.get("member_id") ? Number(form.get("member_id")) : null, String(form.get("reason") || ""));
    refresh(clubId); return { success: command === "approve" ? "Đã kết nối tài khoản với hồ sơ được chọn." : "Đã từ chối yêu cầu và lưu lý do cho người chơi." };
  } catch (error) { return { error: safeError(error).message }; }
}
