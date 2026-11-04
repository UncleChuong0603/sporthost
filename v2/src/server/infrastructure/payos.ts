import "server-only";
import { PayOS } from "@payos/node";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";

export function payosReady() {
  const config = getConfig();
  return !!(config.PAYOS_CLIENT_ID && config.PAYOS_API_KEY && config.PAYOS_CHECKSUM_KEY);
}
export function getPayOS() {
  const config = getConfig();
  if (!payosReady()) throw new AppError(503, "Thanh toán đang được cấu hình. Vui lòng thử lại sau.", "payment_unavailable");
  return new PayOS({ clientId: config.PAYOS_CLIENT_ID, apiKey: config.PAYOS_API_KEY, checksumKey: config.PAYOS_CHECKSUM_KEY,
    baseURL: "https://api-merchant.payos.vn", timeout: 10000, maxRetries: 0, logLevel: "off" });
}

export function safeCheckoutUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !["pay.payos.vn", "payos.vn"].includes(url.hostname) || url.username || url.password || url.port) {
    throw new AppError(502, "Liên kết thanh toán chưa hợp lệ.");
  }
  return url.toString();
}
