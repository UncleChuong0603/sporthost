import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { z } from "zod";
import { AppError } from "@/server/errors";

export const salts = { session: "clubhost-session-v1", csrf: "clubhost-csrf-v1", lookup: "sporthost-guest-review-v1" } as const;
function base64(value: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error("Invalid encoding");
  const data = Buffer.from(value, "base64url");
  if (data.toString("base64url") !== value) throw Error("Noncanonical encoding");
  return data;
}
function key(secret: string, salt: string) { return createHash("sha1").update(salt + "signer" + secret, "utf8").digest(); }

export function readSigned<T>(token: string, secret: string, salt: string, schema: z.ZodType<T>, maxAge: number, now = Math.floor(Date.now() / 1000)): T {
  try {
    if (token.length > 16384 || maxAge < 0 || !Number.isSafeInteger(now)) throw Error("Invalid size/time");
    const pieces = token.split(".");
    if (pieces.length !== 3 && !(pieces.length === 4 && pieces[0] === "")) throw Error("Invalid framing");
    const signature = base64(pieces.pop()!);
    const stamp = pieces.pop()!;
    const payload = pieces.join(".");
    const expected = createHmac("sha1", key(secret, salt)).update(payload + "." + stamp, "utf8").digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw Error("Invalid signature");
    const ts = base64(stamp);
    if (ts.length > 6) throw Error("Invalid timestamp");
    const timestamp = ts.readUIntBE(0, ts.length);
    if (timestamp > now || now - timestamp > maxAge) throw Error("Expired");
    const compressed = payload.startsWith(".");
    const encoded = base64(compressed ? payload.slice(1) : payload);
    const raw = compressed ? inflateSync(encoded, { maxOutputLength: 16384 }) : encoded;
    if (raw.length > 16384) throw Error("Oversized payload");
    return schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
  } catch { throw new AppError(403, "Liên kết hoặc biểu mẫu đã hết hạn. Vui lòng tải lại trang.", "invalid_token"); }
}

export function signPayload(value: unknown, secret: string, salt: string, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isSafeInteger(now) || now < 1) throw Error("Invalid timestamp");
  const raw = Buffer.from(JSON.stringify(value), "utf8");
  if (raw.length > 8192) throw Error("Payload too large");
  let hex = now.toString(16); if (hex.length % 2) hex = "0" + hex;
  const unsigned = raw.toString("base64url") + "." + Buffer.from(hex, "hex").toString("base64url");
  return unsigned + "." + createHmac("sha1", key(secret, salt)).update(unsigned, "utf8").digest("base64url");
}
