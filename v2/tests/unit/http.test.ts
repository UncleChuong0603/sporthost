import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIdentity, ensureMutation } from "@/server/http";
import { boundedForm } from "@/server/form-data";
import { moneySchema, optionalMoney } from "@/domain/session-policy";
beforeEach(() => {
  for (const [key, value] of Object.entries({ DATABASE_URL: "postgresql://test:test@127.0.0.1/sporthost_test", SECRET_KEY: "synthetic-http-test-secret-never-production", APP_ENV: "test", APP_URL: "http://localhost:3000", ALLOWED_HOSTS: "localhost,127.0.0.1", TRUST_PROXY_HEADERS: "false", APP_READ_ONLY: "false" })) vi.stubEnv(key, value);
});
describe("HTTP trust boundary and bounded native forms", () => {
  it("ignores supplied IP headers until the private immediate proxy is explicitly trusted", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.22", "x-forwarded-for": "198.51.100.11,203.0.113.5" });
    expect(clientIdentity(headers)).toBe("untrusted-peer");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true"); expect(clientIdentity(headers)).toBe("203.0.113.5");
    expect(clientIdentity(new Headers({ "x-real-ip": "198.51.100.22" }))).toBe("unknown");
    expect(clientIdentity(new Headers({ "x-forwarded-for": "198.51.100.11,not-an-ip" }))).toBe("unknown");
  });
  it("requires exact origin and approved host, and read-only mode blocks even a valid form", () => {
    expect(() => ensureMutation(new Headers({ host: "localhost:3000", origin: "http://localhost:3000" }))).not.toThrow();
    expect(() => ensureMutation(new Headers({ host: "localhost:3000", origin: "https://outside.invalid" }))).toThrow();
    expect(() => ensureMutation(new Headers({ host: "outside.invalid", origin: "http://localhost:3000" }))).toThrow();
    vi.stubEnv("APP_READ_ONLY", "true"); expect(() => ensureMutation(new Headers({ host: "localhost:3000", origin: "http://localhost:3000" }))).toThrow();
  });
  it("bounds chunked URL-encoded forms without relying on Content-Length", async () => {
    const request = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=" + "a".repeat(65) });
    await expect(boundedForm(request, 64)).rejects.toMatchObject({ status: 413 });
    const valid = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=hello" });
    expect((await boundedForm(valid, 64)).get("name")).toBe("hello");
  });
  it("rejects oversized multipart bodies before image decoding", async () => {
    const form = new FormData(); form.set("proof", new File([new Uint8Array(1024)], "image.png", { type: "image/png" }));
    await expect(boundedForm(new Request("http://localhost", { method: "POST", body: form }), 128)).rejects.toMatchObject({ status: 413 });
  });
  it("keeps nullable/zero fees distinct and rejects empty, boolean, decimal and exponential money", () => {
    expect(optionalMoney.parse(" ")).toBeNull(); expect(optionalMoney.parse("0")).toBe(0);
    for (const value of ["", " ", null, undefined, true, "1e3", "10.5", -1, 100000001]) expect(moneySchema.safeParse(value).success).toBe(false);
  });
});
