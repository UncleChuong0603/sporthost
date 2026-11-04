import { NextResponse, type NextRequest } from "next/server";
import { isLegacyPostPath } from "@/server/compatibility/legacy-paths";
import { pageAccess } from "@/server/compatibility/page-access";
import { safeError, privateHeaders } from "@/server/errors";
import { getConfig } from "@/server/config";

// A page and route.ts cannot occupy the same URL segment. Preserve legacy POST
// forms by an internal rewrite; GET pages retain the original public paths.
export async function proxy(request: NextRequest) {
  const settings = getConfig();
  let host = "";
  try { host = new URL("http://" + (request.headers.get("host") || "")).hostname; } catch { /* Denied below. */ }
  if (!settings.allowedHosts.includes(host) || /[\/@\\\s]/.test(request.headers.get("host") || "")) return Response.json({ detail: "Địa chỉ truy cập không hợp lệ." }, { status: 403, headers: privateHeaders });
  if (["GET", "HEAD"].includes(request.method) && host === "www." + new URL(settings.origin).hostname) return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, settings.origin), 308);
  if (request.method === "GET" || request.method === "HEAD") {
    try { await pageAccess(request.nextUrl, request.cookies.get("clubhost")?.value || ""); }
    catch (error) {
      const safe = safeError(error);
      if (request.headers.get("accept")?.includes("text/html")) return new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SportHost</title></head><body><main style="max-width:36rem;margin:4rem auto;padding:1.5rem;font:16px/1.6 system-ui"><h1>${safe.status === 401 ? "Vui lòng đăng nhập" : safe.status === 403 ? "Bạn chưa có quyền truy cập" : safe.status === 404 ? "Không tìm thấy thông tin" : "Tạm thời chưa xử lý được yêu cầu"}</h1><p>Kiểm tra tài khoản hoặc liên hệ chủ câu lạc bộ để được hỗ trợ.</p><a style="display:inline-flex;min-height:44px;align-items:center" href="${safe.status === 401 ? "/login" : "/dashboard"}">${safe.status === 401 ? "Đăng nhập" : "Về tổng quan"}</a></main></body></html>`, { status: safe.status, headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8" } });
      return Response.json({ detail: safe.message }, { status: safe.status, headers: privateHeaders });
    }
  }
  if (request.method === "POST" && !request.headers.has("next-action") && isLegacyPostPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone(); url.pathname = "/internal/legacy"; url.search = "";
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-sporthost-legacy-path", request.nextUrl.pathname);
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  if (request.method === "POST" && ["/login", "/signup", "/logout"].includes(request.nextUrl.pathname)) {
    // Server Actions at /login use their own transport and same service layer.
    if (request.headers.has("next-action")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/internal/legacy-auth";
    url.searchParams.set("mode", request.nextUrl.pathname.slice(1));
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-sporthost-auth-mode", request.nextUrl.pathname.slice(1));
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
