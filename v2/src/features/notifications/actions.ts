"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { clientIdentity, ensureMutation } from "@/server/http";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { safeError } from "@/server/errors";
import { markNotificationsRead, setReminderPreference, saveClubReminders } from "@/server/modules/notifications/service";
import type { FormState } from "@/features/clubs/settings-form";
async function actor(form: FormData) {
  const h = await headers(); ensureMutation(h); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
  const account = await requireHost(); await rateLimit(clientIdentity(h), "notifications:" + account.id, 30, 60); return account.id;
}
export async function readAll(_state: FormState, form: FormData): Promise<FormState> {
  try { await markNotificationsRead(await actor(form)); revalidatePath("/me", "layout"); revalidatePath("/dashboard"); return { success: "Đã đánh dấu các thông báo là đã đọc." }; }
  catch (error) { return { error: safeError(error).message }; }
}
export async function reminderPreference(_state: FormState, form: FormData): Promise<FormState> {
  try { await setReminderPreference(await actor(form), form.get("enabled") === "on"); revalidatePath("/me/notifications"); return { success: "Đã lưu tùy chọn nhắc việc." }; }
  catch (error) { return { error: safeError(error).message }; }
}
export async function updateReminders(clubId: number, _state: FormState, form: FormData): Promise<FormState> {
  try {
    await saveClubReminders(await actor(form), clubId, { rsvpEnabled: form.get("rsvp") === "on", paymentEnabled: form.get("payment") === "on", rsvpLeadHours: form.get("lead"), paymentIntervalDays: form.get("interval") });
    revalidatePath(`/clubs/${clubId}/reminders`); return { success: "Đã lưu lịch nhắc trong ứng dụng." };
  } catch (error) { return { error: safeError(error).message }; }
}
