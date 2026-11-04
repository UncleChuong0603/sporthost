"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { ensureMutation } from "@/server/http";
import { updatePrices, bulkDues, saveDue, toggleDue, removeQr } from "@/server/modules/finance/club";
import { reviewProof } from "@/server/modules/finance/proofs";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { AppError, safeError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";

export async function clubFinanceCommand(clubId: number, command: string, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); const host = await requireHost();
    const text = (name: string) => String(form.get(name) ?? "");
    if (["fixed", "monthly"].includes(command)) await updatePrices(host.id, clubId, command as "fixed" | "monthly", { amount: form.get("amount"), male: form.get("male"), female: form.get("female") });
    else if (command === "bulk-dues") await bulkDues(host.id, clubId, text("period"));
    else if (command === "due") await saveDue(host.id, clubId, Number(form.get("member_id")), { period: text("period"), amount: form.get("amount") });
    else if (command === "remove-qr") await removeQr(host.id, clubId);
    else throw new AppError(400, "Thao tác chưa hợp lệ.");
    revalidatePath(`/clubs/${clubId}`); revalidatePath(`/clubs/${clubId}/settings`); revalidatePath("/finance"); return { success: "Đã lưu thay đổi." };
  } catch (error) { return { error: safeError(error).message }; }
}
export async function dueCommand(dueId: number, _state: FormState, form: FormData): Promise<FormState> {
  try { ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); const club = await toggleDue((await requireHost()).id, dueId); revalidatePath("/finance"); revalidatePath(`/clubs/${club}`); return { success: "Đã cập nhật khoản thu." }; }
  catch (error) { return { error: safeError(error).message }; }
}
export async function proofCommand(proofId: number, action: "confirm" | "reject", _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    await reviewProof((await requireHost()).id, proofId, { action, receivedAmount: form.get("received_amount"), note: String(form.get("note") || "") });
    revalidatePath("/payments/review"); revalidatePath("/finance"); return { success: "Đã ghi kết quả đối soát." };
  } catch (error) { return { error: safeError(error).message }; }
}
export async function deleteClubAction(clubId: number, _state: FormState, form: FormData): Promise<FormState> {
  try { ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); await deleteClub((await requireHost()).id, clubId, String(form.get("confirmation_name") || "")); revalidatePath("/clubs"); revalidatePath("/dashboard"); }
  catch (error) { return { error: safeError(error).message }; }
  redirect("/clubs?deleted=1");
}
