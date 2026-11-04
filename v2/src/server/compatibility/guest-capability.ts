import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const digest = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");
export const guestToken = (nonce: string, secret: string) => createHmac("sha256", secret).update("guest-booking-v2|" + nonce, "utf8").digest("hex");

export function tokenValid(raw: string, booking: { token_revoked: boolean; token_expires_at: string | null; token_digest: string; legacy_token_digest: string | null }, now = Date.now()) {
  if (raw.length < 24 || raw.length > 256 || booking.token_revoked || !booking.token_expires_at) return false;
  const expires = Date.parse(booking.token_expires_at);
  if (!Number.isFinite(expires) || expires <= now) return false;
  const actual = Buffer.from(digest(raw), "hex");
  return [booking.token_digest, booking.legacy_token_digest].some(value => {
    if (!value || !/^[0-9a-f]{64}$/.test(value)) return false;
    return timingSafeEqual(actual, Buffer.from(value, "hex"));
  });
}
