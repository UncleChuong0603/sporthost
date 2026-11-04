import "server-only";
import { cookies } from "next/headers";
import { guestCookieSchema } from "./session";
import { salts, readSigned, signPayload } from "@/server/compatibility/signed-payload";
import { getConfig } from "@/server/config";
import type { GuestOwner } from "@/server/modules/bookings/guest";

export async function readGuestOwner(publicId: string): Promise<GuestOwner> {
  const raw = (await cookies()).get("sporthost_booking_" + publicId)?.value;
  if (!raw) return null;
  try { return readSigned(raw, getConfig().SECRET_KEY, salts.session, guestCookieSchema, 30 * 86400); } catch { return null; }
}
export async function setGuestOwner(publicId: string, bookingId: number, key: string) {
  (await cookies()).set("sporthost_booking_" + publicId, signPayload({ booking: bookingId, key }, getConfig().SECRET_KEY, salts.session), { httpOnly: true, secure: getConfig().COOKIE_SECURE, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
}
