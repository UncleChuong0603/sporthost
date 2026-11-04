"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginSchema, signupSchema } from "@/lib/schemas/auth";
import { login, signup } from "@/server/auth/service";
import { ensureCsrf, sessionCookie, setSession } from "@/server/auth/session";
import { ensureMutation, clientIdentity } from "@/server/http";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { safeError } from "@/server/errors";

export type AuthResult = { error?: string; fields?: Record<string, string> };
export async function authenticate(mode: "login" | "signup", input: { email: string; password: string; csrf: string }): Promise<AuthResult> {
  try {
    const requestHeaders = await headers();
    ensureMutation(requestHeaders);
    ensureCsrf(input.csrf, await sessionCookie());
    const parsed = (mode === "signup" ? signupSchema : loginSchema).safeParse(input);
    if (!parsed.success) return { error: "Vui lòng kiểm tra lại thông tin.", fields: Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message])) };
    await rateLimit(clientIdentity(requestHeaders), mode, mode === "signup" ? 100 : 30, mode === "signup" ? 3600 : 300);
    const host = mode === "signup" ? await signup(parsed.data.email, parsed.data.password) : await login(parsed.data.email, parsed.data.password);
    await setSession(host);
  } catch (error) { return { error: safeError(error).message }; }
  redirect("/dashboard");
}

export async function logout(form: FormData) {
  ensureMutation(await headers());
  ensureCsrf(String(form.get("csrf") || ""), await sessionCookie());
  (await cookies()).delete("clubhost");
  redirect("/login");
}
