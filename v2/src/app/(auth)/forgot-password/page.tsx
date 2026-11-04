import Link from "next/link";
import { AccountForm } from "@/features/auth/account-form";
import { accountAction } from "../account-actions";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { mailReady } from "@/server/infrastructure/mail";
export const dynamic = "force-dynamic";
export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ audience?: string }> }) {
  const enabled = mailReady(), audience = (await searchParams).audience === "member" ? "member" : "host";
  return <main id="main" className="mx-auto max-w-lg px-6 py-16"><Link href={audience === "member" ? "/me/login" : "/login"} className="mb-8 inline-flex min-h-11 items-center font-semibold text-primary">← Về đăng nhập</Link><section className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">Khôi phục mật khẩu</h1><p className="mb-6 mt-3 text-muted-foreground">{enabled ? "Nhập email tài khoản để nhận liên kết khôi phục." : "Email khôi phục đang được cấu hình. Vui lòng liên hệ quản trị để được hỗ trợ."}</p><AccountForm action={accountAction.bind(null, "forgot")} mode="forgot" audience={audience} csrf={makeCsrf(await sessionCookie())} disabled={!enabled} /></section></main>;
}
