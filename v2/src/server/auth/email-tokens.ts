import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDb, transaction } from "@/server/db/client";
import { hostsInClubhost as hosts, emailTokensInClubhost as tokens, auditLogsInClubhost as audit } from "@/server/db/schema";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";
import { hashPassword } from "./password";
import { mailReady, sendAccountMail } from "@/server/infrastructure/mail";

type Purpose = "verify" | "reset";
const digest = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");
const invalid = () => new AppError(400, "Liên kết đã hết hạn hoặc đã dùng. Vui lòng yêu cầu liên kết mới.", "invalid_token");
export async function issueEmailToken(hostId: number, purpose: Purpose) {
  const raw = randomBytes(36).toString("base64url");
  await transaction(async client => {
    const db = drizzle(client);
    const [host] = await db.select({ id: hosts.id }).from(hosts).where(eq(hosts.id, hostId)).for("update");
    if (!host) throw invalid();
    await db.update(tokens).set({ used: true }).where(and(eq(tokens.hostId, hostId), eq(tokens.purpose, purpose), eq(tokens.used, false)));
    await db.insert(tokens).values({ hostId, purpose, digest: digest(raw), expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), used: false });
  });
  return raw;
}
export async function validEmailToken(raw: string, purpose: Purpose) {
  if (raw.length < 24 || raw.length > 256) throw invalid();
  const [entry] = await getDb().select().from(tokens).where(and(eq(tokens.digest, digest(raw)), eq(tokens.purpose, purpose)));
  if (!entry || entry.used || !Number.isFinite(Date.parse(entry.expiresAt)) || Date.parse(entry.expiresAt) < Date.now()) throw invalid();
  return entry;
}
export async function consumeEmailToken(raw: string, purpose: Purpose, newPassword?: string) {
  const discovered = await validEmailToken(raw, purpose);
  const passwordHash = purpose === "reset" && newPassword ? await hashPassword(newPassword) : undefined;
  if (purpose === "reset" && !passwordHash) throw new AppError(400, "Mật khẩu mới chưa hợp lệ.");
  return transaction(async client => {
    const db = drizzle(client);
    // Consistent host -> token lock order with issue/password operations.
    const [host] = await db.select().from(hosts).where(eq(hosts.id, discovered.hostId)).for("update");
    const [entry] = await db.select().from(tokens).where(eq(tokens.id, discovered.id)).for("update");
    if (!host || !entry || entry.used || Date.parse(entry.expiresAt) < Date.now()) throw invalid();
    if (purpose === "reset") {
      await db.update(hosts).set({ passwordHash, sessionVersion: host.sessionVersion + 1 }).where(eq(hosts.id, host.id));
    } else {
      const allowlist = getConfig().ADMIN_EMAILS.split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
      await db.update(hosts).set({ emailVerified: true, isPlatformAdmin: host.isPlatformAdmin || allowlist.includes(host.email) }).where(eq(hosts.id, host.id));
    }
    await db.update(tokens).set({ used: true }).where(eq(tokens.id, entry.id));
    await db.insert(audit).values({ hostId: host.id, action: purpose === "reset" ? "Đặt lại mật khẩu" : "Xác minh email", details: "Xử lý liên kết một lần", createdAt: new Date().toISOString() });
    return { id: host.id };
  });
}
export async function requestReset(email: string, audience: "host" | "member" = "host") {
  if (!mailReady()) throw new AppError(503, "Email khôi phục đang được cấu hình. Vui lòng liên hệ quản trị.", "mail_unavailable");
  const [host] = await getDb().select({ id: hosts.id, email: hosts.email }).from(hosts).where(eq(hosts.email, email.trim().toLowerCase()));
  if (!host) return;
  const raw = await issueEmailToken(host.id, "reset");
  await sendAccountMail(host.email, "Đặt lại mật khẩu SportHost", `Liên kết hết hạn sau 30 phút:\n${getConfig().origin}/reset-password?token=${raw}${audience === "member" ? "&audience=member" : ""}`);
}
export async function sendVerification(hostId: number, audience: "host" | "member" = "host") {
  if (!mailReady()) throw new AppError(503, "Email xác minh đang được cấu hình. Vui lòng liên hệ quản trị.", "mail_unavailable");
  const [host] = await getDb().select({ id: hosts.id, email: hosts.email, verified: hosts.emailVerified }).from(hosts).where(eq(hosts.id, hostId));
  if (!host) throw invalid(); if (host.verified) return;
  const raw = await issueEmailToken(host.id, "verify");
  await sendAccountMail(host.email, "Xác minh tài khoản SportHost", `Liên kết hết hạn sau 30 phút:\n${getConfig().origin}/verify-email?token=${raw}${audience === "member" ? "&audience=member" : ""}`);
}
