// Explicit development/test bootstrap only. Never imported by the application.
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import pg from "pg";

const local = parse(readFileSync(".env.local"));
const raw = process.env.SPORTHOST_TEST_DATABASE_URL || local.DATABASE_URL;
const url = new URL(raw);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw Error("Test bootstrap refuses remote or non-test databases");
for (const key of ["sslmode", "sslcert", "sslrootcert", "sslkey", "channel_binding", "options"]) url.searchParams.delete(key);
const client = new pg.Client({ connectionString: url.toString(), ssl: false, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const existing = (await client.query("SELECT to_regclass('clubhost.hosts') AS present")).rows[0].present;
  if (!existing) {
    const tables = (await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='clubhost'")).rows[0].count;
    const schema = (await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name='clubhost'")).rowCount;
    if (tables || schema) throw Error("Refused to overwrite an existing incomplete clubhost schema");
    await client.query("BEGIN");
    try {
      await client.query(readFileSync("tests/fixtures/clubhost-baseline.sql", "utf8"));
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
  const revision = (await client.query("SELECT version_num FROM clubhost.alembic_version")).rows;
  if (revision.length !== 1 || revision[0].version_num !== "0011_fixed_member_fees") throw Error("Unexpected legacy baseline; no automatic upgrade is supported");
  await client.query(readFileSync("migrations/0001_member_accounts.sql", "utf8"));
  await client.query(readFileSync("migrations/0002_payos_orders.sql", "utf8"));
  console.log(JSON.stringify({ ready: true, local_test_database: true, initialized_empty_schema: !existing, legacy_revision: revision[0].version_num }));
} finally { await client.end(); }
