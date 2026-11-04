import "server-only";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import { isIP } from "node:net";

export function ensureMutation(headers: Headers) {
  const config = getConfig();
  if (config.APP_READ_ONLY) throw new AppError(503, "Ứng dụng đang chỉ đọc để kiểm tra triển khai.", "read_only");
  const host = headers.get("host") || "";
  let hostname: string;
  try { hostname = new URL("http://" + host).hostname; } catch { throw new AppError(403, "Địa chỉ truy cập không hợp lệ."); }
  if (!config.allowedHosts.includes(hostname) || /[\/@\\\s]/.test(host)) throw new AppError(403, "Địa chỉ truy cập không hợp lệ.");
  let origin = headers.get("origin");
  if (!origin && headers.get("referer")) {
    try { origin = new URL(headers.get("referer")!).origin; } catch { /* Reject below. */ }
  }
  if (origin !== config.origin) throw new AppError(403, "Biểu mẫu phải được gửi từ SportHost.", "invalid_origin");
}

export function clientIdentity(headers: Headers) {
  if (!getConfig().TRUST_PROXY_HEADERS) return "untrusted-peer";
  // Enable only behind the verified private Traefik network, with no direct port exposure.
  // The immediate verified proxy appends its observed peer at the right edge.
  // Never trust a client-supplied X-Real-IP or the left edge of a forwarded chain.
  const raw = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  return isIP(raw) ? raw : "unknown";
}
