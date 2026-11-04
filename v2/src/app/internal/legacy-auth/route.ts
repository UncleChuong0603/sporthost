import { NextResponse, type NextRequest } from "next/server";
import { loginSchema, signupSchema } from "@/lib/schemas/auth";
import { login, signup } from "@/server/auth/service";
import { ensureCsrf, makeSession, SESSION_AGE } from "@/server/auth/session";
import { getConfig } from "@/server/config";
import { ensureMutation, clientIdentity } from "@/server/http";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { AppError, safeError, privateHeaders } from "@/server/errors";

export async function POST(request: NextRequest) {
  try {
    ensureMutation(request.headers);
    const mode = request.headers.get("x-sporthost-auth-mode") || request.nextUrl.searchParams.get("mode");
    if (mode !== "login" && mode !== "signup" && mode !== "logout") throw new AppError(404, "Không tìm thấy trang này.");
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > 16384)) throw new AppError(413, "Yêu cầu quá lớn.");
    // Auth forms are small URL-encoded bodies. Bound streaming, including chunked requests.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    if (reader) { while (true) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 16384) { await reader.cancel(); throw new AppError(413, "Yêu cầu quá lớn."); } chunks.push(value); } }
    if (!(request.headers.get("content-type") || "").startsWith("application/x-www-form-urlencoded")) throw new AppError(400, "Định dạng biểu mẫu không hợp lệ.");
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    ensureCsrf(form.get("csrf") || "", request.cookies.get("clubhost")?.value || "");
    if (mode === "logout") {
      const response = NextResponse.redirect(new URL("/login", getConfig().origin), 303);
      response.cookies.delete("clubhost"); return response;
    }
    const parsed = (mode === "signup" ? signupSchema : loginSchema).safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new AppError(400, "Vui lòng kiểm tra email và mật khẩu.");
    await rateLimit(clientIdentity(request.headers), mode, mode === "signup" ? 100 : 30, mode === "signup" ? 3600 : 300);
    const host = mode === "signup" ? await signup(parsed.data.email, parsed.data.password) : await login(parsed.data.email, parsed.data.password);
    const response = NextResponse.redirect(new URL("/dashboard", getConfig().origin), 303);
    response.cookies.set("clubhost", makeSession(host), { httpOnly: true, secure: getConfig().COOKIE_SECURE, sameSite: "lax", maxAge: SESSION_AGE, path: "/" });
    Object.entries(privateHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  } catch (error) {
    const safe = safeError(error);
    return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders });
  }
}
