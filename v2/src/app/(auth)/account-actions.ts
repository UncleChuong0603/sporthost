"use server";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureMutation, clientIdentity } from "@/server/http";
import { ensureCsrf, sessionCookie, setSession } from "@/server/auth/session";
import { requireHost, changePassword } from "@/server/auth/service";
import { consumeEmailToken, requestReset, sendVerification } from "@/server/auth/email-tokens";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { AppError, safeError } from "@/server/errors";
import { validNewPassword } from "@/server/auth/password";
import type { FormState } from "@/features/clubs/settings-form";

export async function accountAction(mode: "password" | "forgot" | "reset" | "verify" | "send-verification", _state: FormState, form: FormData): Promise<FormState> {
  let destination = "";
  try {
    const h = await headers(); ensureMutation(h); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
    if (mode === "password") {
      const host = await requireHost(); const password = String(form.get("password") || "");
      if (!validNewPassword(password) || password !== form.get("confirm_password")) throw new AppError(400, "Mật khẩu mới cần 10–256 ký tự và khớp phần xác nhận.");
      const updated = await changePassword(host.id, String(form.get("current_password") || ""), password);
      await setSession(updated); return { success: "Đã đổi mật khẩu và thu hồi các phiên cũ." };
    }
    if (mode === "send-verification") {
      await rateLimit(clientIdentity(h), "verify-email", 5, 3600);
      await sendVerification((await requireHost()).id); return { success: "Đã gửi liên kết xác minh. Vui lòng kiểm tra email." };
    }
    if (mode === "forgot") {
      await rateLimit(clientIdentity(h), "password-reset", 5, 3600);
      await requestReset(String(form.get("email") || "")); return { success: "Nếu tài khoản phù hợp, liên kết khôi phục sẽ được gửi qua email." };
    }
    if (mode === "reset") {
      const password = String(form.get("password") || "");
      if (!validNewPassword(password) || password !== form.get("confirm_password")) throw new AppError(400, "Mật khẩu mới cần 10–256 ký tự và khớp phần xác nhận.");
      await consumeEmailToken(String(form.get("token") || ""), "reset", password);
      (await cookies()).delete("clubhost"); destination = "/login?message=reset";
    } else if (mode === "verify") {
      await consumeEmailToken(String(form.get("token") || ""), "verify"); destination = form.get("audience") === "member" ? "/me/profile" : "/login?message=verified";
    } else throw new AppError(400, "Thao tác không hợp lệ.");
  } catch (error) { return { error: safeError(error).message }; }
  redirect(destination);
}
