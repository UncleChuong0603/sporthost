"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireHost } from "@/server/auth/service";
import { ensureCsrf, sessionCookie } from "@/server/auth/session";
import { ensureMutation } from "@/server/http";
import { safeError } from "@/server/errors";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { checkoutPro, refreshPayment, cancelPayment, subscriptionPath } from "@/server/modules/subscriptions/service";
import type { FormState } from "@/features/clubs/settings-form";

async function actor(form: FormData) {
  ensureMutation(await headers()); ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
  const host = await requireHost();
  await rateLimit(String(host.id), "pro-payment", 30, 60);
  return host;
}
export async function buyPro(clubId: number, _state: FormState, form: FormData): Promise<FormState> {
  let target: string;
  try { target = await checkoutPro((await actor(form)).id, clubId); }
  catch (error) { return { error: safeError(error).message }; }
  revalidatePath(subscriptionPath(clubId));
  redirect(target);
}
export async function paymentCommand(clubId: number, orderCode: number, command: "refresh" | "cancel", _state: FormState, form: FormData): Promise<FormState & { status?: string }> {
  try {
    const host = await actor(form);
    const order = await (command === "refresh" ? refreshPayment(host.id, clubId, orderCode) : cancelPayment(host.id, clubId, orderCode));
    if (["PAID", "CANCELLED", "EXPIRED"].includes(order.status)) {
      revalidatePath(subscriptionPath(clubId)); revalidatePath(`/clubs/${clubId}`); revalidatePath("/admin/platform-ledger");
    }
    return { status: order.status, success: order.status === "PAID" ? "Đã thanh toán và kích hoạt Pro. Thời gian còn lại đã được cộng dồn." : order.status === "CANCELLED" ? "Đã hủy đơn. Bạn có thể tạo đơn mới." : order.status === "EXPIRED" ? "Đơn đã hết hạn. Bạn có thể tạo đơn mới." : "Đang chờ thanh toán. Pro sẽ được kích hoạt khi payOS xác nhận." };
  } catch (error) { return { error: safeError(error).message }; }
}
