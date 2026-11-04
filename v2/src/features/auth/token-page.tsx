import Link from "next/link";
import { AccountForm } from "./account-form";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { validEmailToken } from "@/server/auth/email-tokens";
import { accountAction } from "@/app/(auth)/account-actions";
import { AppError } from "@/server/errors";
export async function TokenPage({ mode, token, audience = "host" }: { mode: "reset" | "verify"; token: string; audience?: "host" | "member" }) {
  let valid = false; try { await validEmailToken(token, mode); valid = true; } catch (error) { if (!(error instanceof AppError && error.code === "invalid_token")) throw error; }
  return <main id="main" className="mx-auto max-w-lg px-6 py-16"><section className="rounded-2xl border bg-white p-6"><h1 className="mb-6 text-2xl font-bold">{mode === "verify" ? "Xác minh email" : "Đặt lại mật khẩu"}</h1>{valid ? <AccountForm action={accountAction.bind(null, mode)} mode={mode} token={token} audience={audience} csrf={makeCsrf(await sessionCookie())} /> : <><p className="mb-6 text-muted-foreground">Liên kết đã hết hạn hoặc đã dùng. Vui lòng yêu cầu liên kết mới.</p><Link className="font-semibold text-primary" href={mode === "reset" ? "/forgot-password" : "/account"}>Yêu cầu liên kết mới</Link></>}</section></main>;
}
