"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { ensureMutation } from "@/server/http";
import { createPlatformEntry, editPlatformEntry, extendTrial } from "@/server/modules/platform/service";
import { safeError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";
export async function ledgerCommand(entryId: number | null, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); const host = await requireHost();
    const text = (name: string) => String(form.get(name) ?? "");
    const values = { entryDate: text("entry_date"), direction: text("direction"), category: text("category"), amount: form.get("amount"), note: text("note") };
    if (entryId) await editPlatformEntry(host.id, entryId, values, Number(form.get("version")), text("reason")); else await createPlatformEntry(host.id, values, text("request_key"));
    revalidatePath("/admin/platform-ledger"); return { success: "Đã ghi sổ nền tảng." };
  } catch (error) { return { error: safeError(error).message }; }
}
export async function trialCommand(clubId: number, _state: FormState, form: FormData): Promise<FormState> {
  try { ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie()); await extendTrial((await requireHost()).id, clubId, Number(form.get("days"))); revalidatePath("/admin"); return { success: "Đã gia hạn trial." }; }
  catch (error) { return { error: safeError(error).message }; }
}
