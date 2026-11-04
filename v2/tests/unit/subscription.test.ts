import { describe, expect, it } from "vitest";
import { extendedProEnd, subscriptionState } from "@/domain/subscription";
import { requirePro } from "@/server/modules/subscriptions/entitlements";
import { safeCheckoutUrl } from "@/server/infrastructure/payos";

describe("Pro entitlement and expiry", () => {
  const now = new Date("2026-11-04T05:00:00Z");
  it("treats the exact expiry boundary as free and picks the furthest entitlement", () => {
    expect(subscriptionState({ trialEndsAt: now.toISOString(), proEndsAt: null }, now).kind).toBe("FREE");
    expect(subscriptionState({ trialEndsAt: "2026-11-11T05:00:00Z", proEndsAt: null }, now)).toMatchObject({ kind: "TRIAL", daysLeft: 7 });
    expect(subscriptionState({ trialEndsAt: "2026-11-11T05:00:00Z", proEndsAt: "2026-11-05T05:00:00Z" }, now)).toMatchObject({ kind: "PRO", daysLeft: 7 });
    expect(subscriptionState({ trialEndsAt: "invalid", proEndsAt: null }, now).active).toBe(false);
  });
  it("preserves trial and remaining Pro days across repeated purchases", () => {
    expect(extendedProEnd({ trialEndsAt: "2026-11-11T05:00:00Z", proEndsAt: null }, 30, now)).toBe("2026-12-11T05:00:00.000Z");
    expect(extendedProEnd({ trialEndsAt: null, proEndsAt: "2026-12-11T05:00:00Z" }, 30, now)).toBe("2027-01-10T05:00:00.000Z");
    expect(extendedProEnd({ trialEndsAt: null, proEndsAt: null }, 30, now)).toBe("2026-12-04T05:00:00.000Z");
  });
  it("blocks advanced features on expired clubs", () => {
    expect(() => requirePro({ id: 1, trialEndsAt: null, proEndsAt: null })).toThrow(/SportHost Pro/);
    expect(() => requirePro({ id: 1, trialEndsAt: null, proEndsAt: "2099-01-01T00:00:00Z" })).not.toThrow();
  });
  it.each(["https://pay.payos.vn.attacker.test/x", "javascript:alert(1)", "http://pay.payos.vn/x", "https://secret@pay.payos.vn/x", "https://pay.payos.vn:444/x"])("rejects untrusted checkout URL %s", url => {
    expect(() => safeCheckoutUrl(url)).toThrow();
  });
});
