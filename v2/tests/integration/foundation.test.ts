import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import { randomBytes } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/server/db/schema";
import { closePool, getPool, transaction } from "@/server/db/client";
import { login, signup, changePassword, findCurrentHost } from "@/server/auth/service";
import { makeSession } from "@/server/auth/session";
import { issueEmailToken, consumeEmailToken, validEmailToken } from "@/server/auth/email-tokens";
import baseline from "../fixtures/schema-baseline.json";
import { normalizePostgresDdl } from "../postgres-ddl";
import { assertReady } from "@/server/readiness";

const prefix = "v2-foundation-" + randomBytes(6).toString("hex");
beforeAll(() => {
  const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const explicit = process.env.SPORTHOST_TEST_DATABASE_URL || local.DATABASE_URL;
  if (!explicit) throw new Error("Explicit disposable local PostgreSQL required; this suite never uses DATABASE_URL from the process");
  const url = new URL(explicit);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Integration tests refuse non-loopback or non-test database");
  for (const [key, value] of Object.entries({ DATABASE_URL: explicit, APP_ENV: "test", SECRET_KEY: "synthetic-foundation-tests-secret-never-production", APP_URL: "http://127.0.0.1:3000", COOKIE_SECURE: "false", APP_READ_ONLY: "false", EMAIL_ENABLED: "false", DB_SCHEMA: "clubhost" })) vi.stubEnv(key, value);
});
afterAll(async () => {
  if (process.env.APP_ENV === "test") {
    // Only rows created by this invocation; loopback/test target asserted before connection.
    await transaction(async client => {
      await client.query("DELETE FROM clubhost.audit_logs WHERE host_id IN (SELECT id FROM clubhost.hosts WHERE email LIKE $1)", [prefix + "%"]);
      await client.query("DELETE FROM clubhost.email_tokens WHERE host_id IN (SELECT id FROM clubhost.hosts WHERE email LIKE $1)", [prefix + "%"]);
      await client.query("DELETE FROM clubhost.hosts WHERE email LIKE $1", [prefix + "%"]);
    });
    await closePool();
  }
});

describe("existing clubhost physical schema and reviewed Drizzle mapping", () => {
  it("accepts the complete schema and rejects missing financial fields or a different revision", async () => {
    await transaction(assertReady, { readOnly: true });
    const client = await getPool().connect();
    try {
      const query = client.query.bind(client);
      const incomplete = vi.spyOn(client, "query").mockImplementation(async (...args: unknown[]) => {
        const result = await (query as (...args: unknown[]) => Promise<{ rows: { name?: string; version_num?: string }[] }>)(...args);
        if (String(args[0]).includes("information_schema.columns")) result.rows = result.rows.filter(row => row.name !== "money_movements.amount");
        return result;
      });
      await expect(assertReady(client)).rejects.toThrow("Incomplete clubhost"); incomplete.mockRestore();
      const revision = vi.spyOn(client, "query").mockImplementation(async (...args: unknown[]) => {
        const result = await (query as (...args: unknown[]) => Promise<{ rows: { name?: string; version_num?: string }[] }>)(...args);
        if (String(args[0]).includes("alembic_version")) result.rows = [{ version_num: "unknown_baseline" }];
        return result;
      });
      await expect(assertReady(client)).rejects.toThrow("Unexpected baseline"); revision.mockRestore();
    } finally { vi.restoreAllMocks(); client.release(); }
  });
  it("matches all 241 columns of the observed production baseline", async () => {
    const { rows } = await getPool().query(`SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='clubhost' AND table_name NOT IN ('member_account_links','payment_orders') ORDER BY table_name,ordinal_position`);
    expect(rows).toEqual(baseline.columns);
    let total = 0;
    for (const table of Object.values(schema).filter(value => value !== schema.clubhost)) {
      const config = getTableConfig(table as Parameters<typeof getTableConfig>[0]);
      expect(config.schema).toBe("clubhost");
      const columns = rows.filter(row => row.table_name === config.name);
      expect(config.columns.map(c => c.name).sort()).toEqual(columns.map(c => c.column_name).sort());
      for (const column of config.columns) {
        const physical = columns.find(c => c.column_name === column.name)!;
        expect(column.notNull).toBe(physical.is_nullable === "NO");
        if (physical.column_default === "''::character varying") expect(column.default).toBe("");
      }
      total += config.columns.length;
    }
    expect(total).toBe(241);
  });
  it("retains existing foreign keys, check constraints, sequence and index definitions", async () => {
    const { rows } = await getPool().query(`SELECT c.relname AS table_name,k.conname AS name,k.contype AS type,pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='clubhost' AND c.relname NOT IN ('member_account_links','payment_orders') ORDER BY c.relname,k.conname`);
    const comparable = (values: typeof rows) => values.map(row => ({ ...row, definition: normalizePostgresDdl(row.definition) }));
    expect(comparable(rows)).toEqual(comparable(baseline.constraints));
    const indexes = await getPool().query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='clubhost' AND tablename NOT IN ('member_account_links','payment_orders') ORDER BY tablename,indexname");
    expect(indexes.rows).toEqual(baseline.indexes);
  });
  it("rolls back failed writes and enforces real PostgreSQL read-only transactions", async () => {
    await expect(transaction(async client => {
      await client.query("INSERT INTO clubhost.hosts(email,password_hash) VALUES($1,'synthetic')", [prefix + "rollback@example.com"]);
      throw Error("Simulated post-insert failure");
    })).rejects.toThrow("Simulated");
    expect((await getPool().query("SELECT id FROM clubhost.hosts WHERE email=$1", [prefix + "rollback@example.com"])).rowCount).toBe(0);
    await expect(transaction(client => client.query("INSERT INTO clubhost.hosts(email,password_hash) VALUES($1,'synthetic')", [prefix + "readonly@example.com"]), { readOnly: true })).rejects.toMatchObject({ code: "25006" });
  });
});

describe("self-hosted auth on existing tables", () => {
  it("creates and logs in without changing schema, and password change invalidates old sessions", async () => {
    const email = prefix + "host@example.com";
    const host = await signup(email, "Mật khẩu ban đầu 🏸");
    const oldCookie = makeSession(host);
    expect((await findCurrentHost(oldCookie))?.email).toBe(email);
    expect(await login(email.toUpperCase(), "Mật khẩu ban đầu 🏸")).toEqual(host);
    expect(await findCurrentHost(oldCookie + "tampered")).toBeNull();
    const changed = await changePassword(host.id, "Mật khẩu ban đầu 🏸", "Mật khẩu mới an toàn 🦉");
    expect(await findCurrentHost(oldCookie)).toBeNull();
    expect(await login(email, "Mật khẩu mới an toàn 🦉")).toEqual(changed);
    await expect(login(email, "Mật khẩu ban đầu 🏸")).rejects.toMatchObject({ code: "invalid_credentials" });
    const identity = await findCurrentHost(makeSession(changed));
    expect(identity).not.toHaveProperty("passwordHash");
    expect(identity?.isPlatformAdmin).toBe(false);
  });
  it("resolves concurrent duplicate signup to one account", async () => {
    const email = prefix + "race@example.com";
    const results = await Promise.allSettled([signup(email, "race-password-123"), signup(email, "race-password-123")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await getPool().query("SELECT id FROM clubhost.hosts WHERE email=$1", [email])).rowCount).toBe(1);
  });
  it("consumes a reset token once during concurrent requests and revokes the old session", async () => {
    const email = prefix + "reset@example.com"; const host = await signup(email, "old-password-123");
    const old = makeSession(host); const token = await issueEmailToken(host.id, "reset");
    const attempts = await Promise.allSettled([consumeEmailToken(token, "reset", "new-password-123"), consumeEmailToken(token, "reset", "new-password-123")]);
    expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
    expect(await findCurrentHost(old)).toBeNull();
    await expect(validEmailToken(token, "reset")).rejects.toMatchObject({ code: "invalid_token" });
    expect((await login(email, "new-password-123")).id).toBe(host.id);
  });
  it("invalidates previously issued verification links and never promotes unallowlisted hosts", async () => {
    const email = prefix + "verify@example.com"; const host = await signup(email, "verification-password");
    const first = await issueEmailToken(host.id, "verify"); const latest = await issueEmailToken(host.id, "verify");
    await expect(consumeEmailToken(first, "verify")).rejects.toMatchObject({ code: "invalid_token" });
    await consumeEmailToken(latest, "verify");
    expect(await findCurrentHost(makeSession(host))).toMatchObject({ emailVerified: true, isPlatformAdmin: false });
  });
});
