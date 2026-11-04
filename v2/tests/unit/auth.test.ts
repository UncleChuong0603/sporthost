import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { createHmac, createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import fixtures from "../fixtures/legacy-auth.json";
import { verifyPassword, hashPassword, validNewPassword } from "@/server/auth/password";
import { readSigned, signPayload, salts } from "@/server/compatibility/signed-payload";
import { guestToken, tokenValid } from "@/server/compatibility/guest-capability";
import { makeCsrf, ensureCsrf, readSession } from "@/server/auth/session";
import { ensureMutation } from "@/server/http";

beforeEach(() => {
  vi.stubEnv("SECRET_KEY", fixtures.secret);
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1/sporthost_test");
  vi.stubEnv("APP_URL", "http://127.0.0.1:3000"); vi.stubEnv("ALLOWED_HOSTS", "127.0.0.1,localhost");
  vi.stubEnv("APP_ENV", "test"); vi.stubEnv("APP_READ_ONLY", "false");
});

describe("Python password interoperability", () => {
  it.each(fixtures.passwords)("verifies synthetic Python password fixture $label", async fixture => {
    expect(await verifyPassword(fixture.password, fixture.hash)).toBe(true);
    expect(await verifyPassword("wrong-password", fixture.hash)).toBe(false);
  });
  it("handles malformed hashes and absent users without parsing errors", async () => {
    for (const hash of [null, "", "a:b", "gg".repeat(16) + ":" + "00".repeat(32)]) expect(await verifyPassword("password-123", hash)).toBe(false);
  });
  it("uses Unicode code points and preserves legacy storage format", async () => {
    expect(validNewPassword("🦉".repeat(256))).toBe(true);
    expect(validNewPassword("🦉".repeat(257))).toBe(false);
    const hash = await hashPassword("Mật khẩu cầu lông 🏸");
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(await verifyPassword("Mật khẩu cầu lông 🏸", hash)).toBe(true);
  });
});

describe("ItsDangerous compatibility with signed timestamps and compressed JSON", () => {
  it.each(fixtures.tokens)("reads Python $label", fixture => {
    expect(readSigned(fixture.token, fixtures.secret, fixture.salt, z.unknown(), fixture.maxAge, fixtures.now)).toEqual(fixture.payload);
    expect(() => readSigned(fixture.token, fixtures.secret, fixture.salt, z.unknown(), fixture.maxAge, fixtures.now + fixture.maxAge + 1)).toThrow();
    expect(() => readSigned(fixture.token, fixtures.secret, fixture.salt, z.unknown(), fixture.maxAge, fixtures.now - 1)).toThrow();
    expect(() => readSigned(fixture.token, fixtures.secret, fixture.salt + "wrong", z.unknown(), fixture.maxAge, fixtures.now)).toThrow();
  });
  it("accepts the exact age boundary and requires typed data", () => {
    const token = signPayload({ id: 7 }, fixtures.secret, salts.session, fixtures.now);
    expect(readSigned(token, fixtures.secret, salts.session, z.object({ id: z.number() }), 60, fixtures.now + 60)).toEqual({ id: 7 });
    expect(() => readSigned(token, fixtures.secret, salts.session, z.object({ id: z.string() }), 60, fixtures.now)).toThrow();
  });
  it("rejects signed decompression bombs and malformed framing", () => {
    const payload = "." + deflateSync(Buffer.from(JSON.stringify({ text: "x".repeat(20000) }))).toString("base64url");
    const time = Buffer.from(fixtures.now.toString(16), "hex").toString("base64url");
    const key = createHash("sha1").update(salts.session + "signer" + fixtures.secret).digest();
    const signed = payload + "." + time;
    const bomb = signed + "." + createHmac("sha1", key).update(signed).digest("base64url");
    for (const token of [bomb, "a.b.c.d.e", "x".repeat(20000), "....", fixtures.tokens[0].token.slice(0, -2) + "!!"]) expect(() => readSigned(token, fixtures.secret, salts.session, z.unknown(), 60, fixtures.now)).toThrow();
  });
  it("binds CSRF to the exact cookie, and never grants unsigned session data", () => {
    const csrf = makeCsrf("synthetic-cookie"); ensureCsrf(csrf, "synthetic-cookie");
    expect(() => ensureCsrf(csrf, "different-cookie")).toThrow();
    expect(() => readSession("eyJpZCI6MX0")).toThrow();
  });
});

it("preserves the exact guest HMAC and rejects revoked/expired links", () => {
  const token = guestToken(fixtures.nonce, fixtures.secret);
  expect(token).toBe(fixtures.guestToken);
  const booking = { token_revoked: false, token_expires_at: "2030-01-01T00:00:00+00:00", token_digest: fixtures.guestDigest, legacy_token_digest: null };
  expect(tokenValid(token, booking, fixtures.now * 1000)).toBe(true);
  expect(tokenValid(token, { ...booking, token_revoked: true }, fixtures.now * 1000)).toBe(false);
  expect(tokenValid(token, { ...booking, token_expires_at: "2020-01-01" }, fixtures.now * 1000)).toBe(false);
});

it("enforces read-only and origin/host protections at mutation boundaries", () => {
  const headers = new Headers({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" });
  ensureMutation(headers);
  expect(() => ensureMutation(new Headers({ host: "evil.example", origin: "http://evil.example" }))).toThrow();
  vi.stubEnv("APP_READ_ONLY", "true"); expect(() => ensureMutation(headers)).toThrow();
});
