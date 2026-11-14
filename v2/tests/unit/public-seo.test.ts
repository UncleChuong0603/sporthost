import { describe, expect, it } from "vitest";
import { canonicalOrigin, publicPages, publicIndexing, indexablePath } from "@/lib/public-pages";
describe("public indexing boundaries", () => {
  it("opens only the canonical production website", () => {
    expect(publicIndexing("production", canonicalOrigin)).toBe(true);
    for (const env of ["staging", "test", "development"]) expect(publicIndexing(env, canonicalOrigin)).toBe(false);
    expect(publicIndexing("production", "https://preview.example.com")).toBe(false);
  });
  it("never adds private or capability URLs to indexable pages", () => {
    expect(publicPages).toEqual(["/", "/tinh-nang", "/bang-gia"]);
    for (const path of ["/login", "/account", "/me", "/me/notifications", "/clubs/1", "/games/1", "/join/secret", "/attend/secret", "/dues/pay/secret", "/tinh-nang/missing"]) expect(indexablePath(path)).toBe(false);
  });
});
