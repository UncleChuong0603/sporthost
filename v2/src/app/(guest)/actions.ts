"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { readGuestOwner, setGuestOwner } from "@/server/auth/guest-cookie";
import { ensureMutation, clientIdentity } from "@/server/http";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { lookupGuest, joinGuest, guestDecision, editGuestGroup, type GuestInput } from "@/server/modules/bookings/guest";
import { safeError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";
import { guestPayer } from "@/server/modules/finance/service";

export async function guestPayerAction(key: string, _state: FormState, form: FormData): Promise<FormState> {
  try {
    ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    await guestPayer(key, String(form.get("mode") || "")); revalidatePath(`/attend/${key}`);
    return { success: "Đã cập nhật người thanh toán." };
  } catch (error) { return { error: safeError(error).message }; }
}

export async function lookupPublic(publicId: string, phone: string, csrf: string) {
  try {
    const h = await headers(); ensureMutation(h); ensureCsrf(csrf, await sessionCookie());
    await rateLimit(clientIdentity(h), "lookup:" + publicId, 60, 60);
    return { review: await lookupGuest(publicId, phone, await readGuestOwner(publicId)), error: "" };
  } catch (error) { return { review: null, error: safeError(error).message }; }
}
export async function joinPublic(publicId: string, input: GuestInput, csrf: string): Promise<FormState> {
  let message = "";
  try {
    const h = await headers(); ensureMutation(h); ensureCsrf(csrf, await sessionCookie());
    await rateLimit(clientIdentity(h), "join:" + publicId, 30, 300);
    const result = await joinGuest(publicId, input, await readGuestOwner(publicId));
    if (result.key && result.bookingId) await setGuestOwner(publicId, result.bookingId, result.key);
    message = result.message;
  } catch (error) { return { error: safeError(error).message }; }
  revalidatePath(`/join/${publicId}`); redirect(`/join/${publicId}?message=${message}`);
}
export async function guestCommand(key: string, command: "cancel" | "yes" | "no" | "edit", _state: FormState, form: FormData): Promise<FormState> {
  try {
    const h = await headers(); ensureMutation(h); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    await rateLimit(clientIdentity(h), "guest-token", 120, 60);
    if (command === "edit") {
      const names = form.getAll("companion_name"), genders = form.getAll("companion_gender"), levels = form.getAll("companion_level");
      if (genders.length > names.length || levels.length > names.length) return { error: "Thông tin nhóm chưa hợp lệ." };
      await editGuestGroup(key, names.map((name, i) => ({ name: String(name), gender: String(genders[i] || "unspecified") as "unspecified", level: String(levels[i] || "") })));
    } else await guestDecision(key, command);
    revalidatePath(`/attend/${key}`); return { success: "Đã cập nhật đăng ký." };
  } catch (error) { return { error: safeError(error).message }; }
}
