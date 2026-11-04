import "server-only";

export class AppError extends Error {
  constructor(public status: number, message: string, public code = "invalid_request") { super(message); }
}

export function safeError(error: unknown) {
  if (error instanceof AppError) return error;
  // Never serialize raw database/provider errors: they can contain credentials or rows.
  let current = error; let sqlCode = "";
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current && /^[A-Z0-9_]{3,32}$/.test(String(current.code))) sqlCode = String(current.code);
    current = "cause" in current ? current.cause : null;
  }
  if (["23505", "40001", "40P01"].includes(sqlCode)) return new AppError(409, "Thông tin vừa thay đổi. Vui lòng tải lại và kiểm tra.", "conflict");
  // Operational diagnostics contain categories only, never error messages, SQL, URLs or supplied data.
  console.error(JSON.stringify({ event: "sporthost_operation_failed", category: error instanceof Error && /^[A-Za-z0-9_]{1,50}$/.test(error.name) ? error.name : "Unknown", code: sqlCode || "UNKNOWN" }));
  return new AppError(503, "Tạm thời chưa xử lý được yêu cầu. Vui lòng kiểm tra lại trạng thái trước khi thử lại.", "unavailable");
}

export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
