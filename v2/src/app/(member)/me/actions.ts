"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { ensureMutation, clientIdentity } from "@/server/http";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { sendVerification } from "@/server/auth/email-tokens";
import { guestDecision, editGuestGroup } from "@/server/modules/bookings/guest";
import { guestPayer } from "@/server/modules/finance/service";
import { safeError, AppError } from "@/server/errors";
import type { FormState } from "@/features/clubs/settings-form";

export async function memberBookingCommand(bookingId: number, command: "yes" | "no" | "cancel" | "edit" | "payer", _state: FormState, form: FormData): Promise<FormState> {
  try {
    const h = await headers(); ensureMutation(h); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const account = await requireHost();
    if (!Number.isSafeInteger(bookingId) || bookingId < 1 || bookingId > 2147483647 || !["yes","no","cancel","edit","payer"].includes(command)) throw new AppError(400, "Thao tác đăng ký không hợp lệ.");
    await rateLimit(clientIdentity(h), "member-booking:" + account.id, 120, 60);
    const access = { accountId: account.id, bookingId };
    if (command === "payer") await guestPayer(access, String(form.get("mode") || ""));
    else if (command === "edit") {
      const names = form.getAll("companion_name"), genders = form.getAll("companion_gender"), levels = form.getAll("companion_level");
      if (names.length > 19 || genders.length > names.length || levels.length > names.length) throw new AppError(400, "Kiểm tra thông tin người đi cùng.");
      await editGuestGroup(access, names.map((name,i) => ({ name: String(name), gender: String(genders[i] || "unspecified") as "unspecified", level: String(levels[i] || "") })));
    } else await guestDecision(access, command);
    revalidatePath("/me", "layout");
    return { success: "Đã cập nhật đăng ký." };
  } catch (error) { return { error: safeError(error).message }; }
}

export async function memberVerification(_state: FormState, form: FormData): Promise<FormState> {
  try {
    const h = await headers(); ensureMutation(h); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    const account = await requireHost();
    await rateLimit(clientIdentity(h), "verify-email", 5, 3600);
    await sendVerification(account.id, "member");
    return { success: "Đã gửi liên kết xác minh. Vui lòng kiểm tra email." };
  } catch (error) { return { error: safeError(error).message }; }
}
