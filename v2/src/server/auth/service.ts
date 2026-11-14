import "server-only";
import { eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDb, transaction } from "@/server/db/client";
import { hostsInClubhost as hosts, auditLogsInClubhost as audit } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { readSession, sessionCookie } from "@/server/auth/session";
import { AppError } from "@/server/errors";

const hostFields = { id: hosts.id, email: hosts.email, emailVerified: hosts.emailVerified, isPlatformAdmin: hosts.isPlatformAdmin, sessionVersion: hosts.sessionVersion };
export type HostIdentity = { id: number; email: string; emailVerified: boolean; isPlatformAdmin: boolean; sessionVersion: number };

export async function findCurrentHost(raw: string): Promise<HostIdentity | null> {
  if (!raw) return null;
  let payload;
  try { payload = readSession(raw); } catch { return null; }
  const [host] = await getDb().select(hostFields).from(hosts).where(and(eq(hosts.id, payload.id), sql`NOT EXISTS (SELECT 1 FROM clubhost.account_controls ac WHERE ac.account_id=${hosts.id} AND ac.suspended)`)).limit(1);
  return host && host.sessionVersion === payload.v ? host : null;
}
export async function currentHost() { return findCurrentHost(await sessionCookie()); }
export async function requireHost() {
  const host = await currentHost();
  if (!host) throw new AppError(401, "Vui lòng đăng nhập để tiếp tục.", "unauthenticated");
  return host;
}

export async function login(email: string, password: string) {
  const [stored] = await getDb().select().from(hosts).where(eq(hosts.email, email.trim().toLowerCase())).limit(1);
  const valid = await verifyPassword(password, stored?.passwordHash);
  if (!stored || !valid) throw new AppError(400, "Email hoặc mật khẩu không đúng.", "invalid_credentials");
  const suspended = await getDb().execute(sql`SELECT 1 FROM clubhost.account_controls WHERE account_id=${stored.id} AND suspended`);
  if (suspended.rows.length) throw new AppError(403, "Tài khoản đã bị đình chỉ. Vui lòng liên hệ SportHost.", "account_suspended");
  return { id: stored.id, session_version: stored.sessionVersion };
}

export async function signup(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  return transaction(async client => {
    const db = drizzle(client);
    const [host] = await db.insert(hosts).values({ email: email.trim().toLowerCase(), passwordHash }).onConflictDoNothing().returning({ id: hosts.id, session_version: hosts.sessionVersion });
    if (!host) throw new AppError(400, "Email đã được sử dụng.", "email_exists");
    return host;
  });
}

export async function changePassword(hostId: number, current: string, password: string) {
  const replacement = await hashPassword(password);
  return transaction(async client => {
    const db = drizzle(client);
    const [host] = await db.select().from(hosts).where(eq(hosts.id, hostId)).for("update");
    if (!host || !await verifyPassword(current, host.passwordHash)) throw new AppError(400, "Mật khẩu hiện tại không đúng.");
    const [updated] = await db.update(hosts).set({ passwordHash: replacement, sessionVersion: host.sessionVersion + 1 }).where(eq(hosts.id, hostId)).returning({ id: hosts.id, session_version: hosts.sessionVersion });
    await db.insert(audit).values({ hostId, action: "Đổi mật khẩu", details: "Đã thu hồi các phiên đăng nhập cũ", createdAt: new Date().toISOString() });
    return updated;
  });
}
