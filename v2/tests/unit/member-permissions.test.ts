import { describe, it, expect } from "vitest";
import { normalizePhone, phoneAliases } from "@/domain/catalog";
import { capabilities, hasPermission } from "@/server/access/permissions";

describe("contact and permission invariants", () => {
  it.each(["0902345678", "+84 902 345 678", "84902345678", "090-234-5678"])("matches Vietnamese phone alias %s", phone => expect(normalizePhone(phone)).toBe("0902345678"));
  it("does not coerce arbitrary invalid contact input into a phone", () => { expect(() => normalizePhone("hello0902345678")).toThrow(); expect(phoneAliases("0902345678")).toEqual(["0902345678", "+84902345678", "84902345678"]); });
  it("retains legacy roles and denies unrecognized/malformed custom capabilities", () => {
    expect(capabilities({ role: "manager", permissions: null })).toEqual(["manage_session", "manage_bookings", "check_in"]);
    expect(capabilities({ role: "finance", permissions: null })).toEqual(["manage_finance"]);
    expect(capabilities({ role: "custom", permissions: '["owner","check_in"]' })).toEqual(["check_in"]);
    expect(capabilities({ role: "custom", permissions: '{invalid' })).toEqual([]);
    expect(hasPermission(false, ["check_in"], "contacts")).toBe(false);
    expect(hasPermission(false, ["edit_club_settings"], "owner")).toBe(false);
  });
});
