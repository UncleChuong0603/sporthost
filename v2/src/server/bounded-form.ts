import "server-only";
import { AppError } from "./errors";
export async function boundedForm(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new AppError(413, "File quá lớn. Vui lòng chọn file tối đa 2 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Chưa nhận được file.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AppError(413, "File quá lớn. Vui lòng chọn file tối đa 2 MB."); }
      chunks.push(next.value);
    }
    const bytes = Buffer.concat(chunks);
    return await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, "Chưa đọc được file. Hãy chọn lại file Excel."); }
}
