import { receivePaymentWebhook } from "@/server/modules/subscriptions/service";
import { AppError, safeError, privateHeaders } from "@/server/errors";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 32768) throw new AppError(413, "Webhook quá lớn.");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError(400, "Thiếu webhook.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32768) { await reader.cancel(); throw new AppError(413, "Webhook quá lớn."); }
      chunks.push(chunk.value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError(400, "JSON chưa hợp lệ."); }
    await receivePaymentWebhook(body);
    return Response.json({ success: true }, { headers: privateHeaders });
  } catch (error) {
    const safe = safeError(error);
    return Response.json({ success: false, detail: safe.message }, { status: safe.status, headers: privateHeaders });
  }
}
