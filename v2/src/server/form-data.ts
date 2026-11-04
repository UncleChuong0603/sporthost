import "server-only";
import { AppError } from "@/server/errors";

export async function boundedForm(request: Request, limit = 64 * 1024) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("application/x-www-form-urlencoded") && !contentType.startsWith("multipart/form-data;")) throw new AppError(400, "Định dạng biểu mẫu không hợp lệ.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new AppError(413, "Yêu cầu quá lớn.");
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new AppError(413, "Yêu cầu quá lớn."); }
    chunks.push(value);
  }
  try { return await new Request("http://local.invalid", { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks) }).formData(); }
  catch { throw new AppError(400, "Biểu mẫu chưa hợp lệ."); }
}
