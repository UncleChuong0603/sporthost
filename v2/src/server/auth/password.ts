import "server-only";
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(pbkdf2);
const legacyPattern = /^[0-9a-f]{32}:[0-9a-f]{64}$/;
const dummy = "00".repeat(16) + ":" + "00".repeat(32);
export function passwordLength(value: string) { return [...value].length; }
export function validNewPassword(value: string) { const size = passwordLength(value); return size >= 10 && size <= 256; }

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (passwordLength(password) > 256 || Buffer.byteLength(password, "utf8") > 1024) return false;
  const valid = typeof stored === "string" && legacyPattern.test(stored);
  const [salt, expected] = (valid ? stored : dummy).split(":");
  const actual = await derive(Buffer.from(password, "utf8"), Buffer.from(salt, "hex"), 310000, 32, "sha256");
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) && valid;
}

export async function hashPassword(password: string) {
  if (!validNewPassword(password)) throw new Error("Password must contain 10–256 Unicode characters");
  const salt = randomBytes(16);
  const hash = await derive(Buffer.from(password, "utf8"), salt, 310000, 32, "sha256");
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
