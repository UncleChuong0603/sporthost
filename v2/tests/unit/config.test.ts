import { describe, it, expect } from "vitest";
import { parseConfig } from "@/server/config";
import { safeError } from "@/server/errors";

const valid = { DATABASE_URL: "postgresql://test:test@localhost:5432/sporthost_test", SECRET_KEY: "synthetic-only-a-very-long-random-test-value", APP_URL: "http://localhost:3000" };
describe("validated runtime configuration", () => {
  it("loads development and normalizes the Python driver URL without exposing it", () => {
    const settings = parseConfig({ ...valid, DATABASE_URL: valid.DATABASE_URL.replace("postgresql:", "postgresql+psycopg:") });
    expect(settings.databaseUrl).toBe(valid.DATABASE_URL);
    expect(settings.APP_READ_ONLY).toBe(false);
  });
  it.each([{ DB_SCHEMA: "public" }, { SECRET_KEY: "[SENSITIVE]" }, { APP_URL: "https://example.com/path" }, { APP_READ_ONLY: "yes" }, { ALLOWED_HOSTS: "*" }, { DATABASE_URL: "sqlite:///local.db" }])("refuses invalid settings %j", bad => {
    expect(() => parseConfig({ ...valid, ...bad })).toThrow();
  });
  it("requires HTTPS, secure cookies, allowed hosts and volume in production", () => {
    expect(() => parseConfig({ ...valid, APP_ENV: "production" })).toThrow();
    expect(parseConfig({ ...valid, APP_ENV: "production", APP_URL: "https://sporthost.online", ALLOWED_HOSTS: "sporthost.online", COOKIE_SECURE: "true", DATABASE_URL: "postgresql://test:test@db.internal/sporthost", STORAGE_ROOT: "/data/uploads" }).deployed).toBe(true);
  });
  it("does not leak raw SQL or secrets through error conversion", () => {
    expect(safeError(new Error("postgresql://private-password/private-row")).message).not.toContain("private");
    expect(safeError({ code: "23505", detail: "secret row" }).status).toBe(409);
  });
  it("uses a Resend key only with its explicit SMTP host and never enables delivery from a key alone", () => {
    const alone = parseConfig({ ...valid, RESEND_API_KEY: "synthetic-only-key" });
    expect(alone.EMAIL_ENABLED).toBe(false); expect(alone.SMTP_PASSWORD).toBeUndefined();
    const smtp = parseConfig({ ...valid, EMAIL_ENABLED: "true", SMTP_HOST: "smtp.resend.com", RESEND_API_KEY: "synthetic-only-key", EMAIL_FROM: "test@example.com" });
    expect(smtp.SMTP_USER).toBe("resend"); expect(smtp.SMTP_PASSWORD).toBe("synthetic-only-key");
    expect(() => parseConfig({ ...valid, SMTP_HOST: "other.example.com", SMTP_USER: "resend", RESEND_API_KEY: "synthetic-only-key" })).toThrow("SMTP password missing");
  });
});
