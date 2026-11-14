import { describe, expect, it } from "vitest";
import { authDestination } from "@/domain/auth-destination";

describe("login destination allowlist", () => {
  it("preserves only the exact member invitation path and existing entry points", () => {
    const path = "/me/connect/" + "a".repeat(32);
    expect(authDestination(path)).toBe(path);
    expect(authDestination("/dashboard")).toBe("/dashboard");
    expect(authDestination("/me")).toBe("/me");
    for (const raw of [undefined, "//evil.test", "https://evil.test", path + "?next=https://evil.test", path + "/extra", "/admin", "/me/connect/%2f%2fevil.test", "\\\\evil.test", "\n" + path]) {
      expect(authDestination(raw)).toBe("/me");
      expect(authDestination(raw, "/dashboard")).toBe("/dashboard");
    }
  });
});
