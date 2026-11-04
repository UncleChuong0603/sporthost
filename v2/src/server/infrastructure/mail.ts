import "server-only";
import nodemailer from "nodemailer";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import { readFile } from "node:fs/promises";

export function mailReady() { const config = getConfig(); return config.EMAIL_ENABLED && !!config.SMTP_HOST && !!config.EMAIL_FROM; }
export async function sendAccountMail(recipient: string, subject: string, text: string) {
  const config = getConfig();
  if (!mailReady()) throw new AppError(503, "Email đang được cấu hình. Vui lòng liên hệ quản trị để được hỗ trợ.", "mail_unavailable");
  let ca: Buffer | undefined;
  try { if (config.SMTP_TLS_CA_FILE) ca = await readFile(/* turbopackIgnore: true */ config.SMTP_TLS_CA_FILE); }
  catch { throw new AppError(503, "Chứng chỉ máy chủ email chưa sẵn sàng.", "mail_unavailable"); }
  const transport = nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465, requireTLS: config.SMTP_PORT !== 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    tls: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false });
  try {
    const result = await transport.sendMail({ from: config.EMAIL_FROM, to: recipient, subject, text });
    if (!result.accepted?.length) throw Error("Not accepted");
  } catch { throw new AppError(503, "Chưa gửi được email. Vui lòng thử lại sau.", "mail_unavailable"); }
  finally { transport.close(); }
}
