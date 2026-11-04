import "server-only";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getConfig } from "@/server/config";
import { readSigned, signPayload, salts } from "@/server/compatibility/signed-payload";
import { AppError } from "@/server/errors";

export const sessionSchema = z.object({ id: z.number().int().positive(), v: z.number().int().nonnegative().default(0) }).strict();
export const guestCookieSchema = z.object({ booking: z.number().int().positive(), key: z.string().min(24).max(256) }).strict();
const csrfSchema = z.object({ session: z.string().max(8192) }).strict();
export const SESSION_AGE = 14 * 86400;
export function makeSession(host: { id: number; session_version: number }) {
  return signPayload({ id: host.id, v: host.session_version }, getConfig().SECRET_KEY, salts.session);
}
export function readSession(raw: string) { return readSigned(raw, getConfig().SECRET_KEY, salts.session, sessionSchema, SESSION_AGE); }
export async function sessionCookie() { return (await cookies()).get("clubhost")?.value || ""; }
export function makeCsrf(rawSession: string) { return signPayload({ session: rawSession || "public" }, getConfig().SECRET_KEY, salts.csrf); }
export function ensureCsrf(token: string, rawSession: string) {
  const saved = readSigned(token, getConfig().SECRET_KEY, salts.csrf, csrfSchema, 6 * 3600);
  const expected = Buffer.from(rawSession || "public"); const actual = Buffer.from(saved.session);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError(403, "Biểu mẫu không hợp lệ. Vui lòng tải lại trang.");
}
export async function setSession(host: { id: number; session_version: number }) {
  (await cookies()).set("clubhost", makeSession(host), { httpOnly: true, secure: getConfig().COOKIE_SECURE, sameSite: "lax", maxAge: SESSION_AGE, path: "/" });
}
