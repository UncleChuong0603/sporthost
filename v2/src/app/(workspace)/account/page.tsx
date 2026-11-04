import { AccountForm } from "@/features/auth/account-form";
import { accountAction } from "@/app/(auth)/account-actions";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { mailReady } from "@/server/infrastructure/mail";
export default async function Account() {
  const host = await requireHost(); const csrf = makeCsrf(await sessionCookie()); const enabled = mailReady();
  return <><h1 className="text-3xl font-bold">Tài khoản</h1><p className="mb-8 mt-2 text-muted-foreground">Quản lý mật khẩu và email của bạn.</p><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border bg-white p-6"><h2 className="mb-5 text-xl font-semibold">Thông tin đăng nhập</h2><p className="font-semibold">{host.email}</p><p className="my-3 text-sm text-muted-foreground">{host.emailVerified ? "Email đã xác minh" : "Email chưa xác minh"}</p>{!host.emailVerified && <><AccountForm action={accountAction.bind(null, "send-verification")} csrf={csrf} mode="verify" disabled={!enabled} />{!enabled && <p className="mt-4 text-sm text-muted-foreground">Email xác minh đang được cấu hình. Chưa thể gửi liên kết lúc này.</p>}</>}</section><section className="rounded-2xl border bg-white p-6"><h2 className="mb-5 text-xl font-semibold">Đổi mật khẩu</h2><AccountForm action={accountAction.bind(null, "password")} mode="password" csrf={csrf} /></section></div></>;
}
