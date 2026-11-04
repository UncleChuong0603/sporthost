import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { vi } from "vitest";

export function installTestEnv() {
  const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const explicit = process.env.SPORTHOST_TEST_DATABASE_URL || local.DATABASE_URL;
  if (!explicit) throw new Error("Disposable loopback PostgreSQL required");
  const url = new URL(explicit);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Tests refuse production/remote databases");
  for (const [key, value] of Object.entries({ DATABASE_URL: explicit, APP_ENV: "test", SECRET_KEY: "synthetic-integration-secret-never-production", APP_URL: "http://127.0.0.1:3000", ALLOWED_HOSTS: "127.0.0.1,localhost", COOKIE_SECURE: "false", APP_READ_ONLY: "false", EMAIL_ENABLED: "false", DB_SCHEMA: "clubhost" })) vi.stubEnv(key, value);
}
