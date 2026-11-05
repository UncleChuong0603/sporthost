import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectDatabase, paymentSchemaIssues } from "../check_nextjs_release.mjs";

const require = createRequire(new URL("../../v2/package.json", import.meta.url));
const { parse } = require("dotenv");
let healthy;
before(async () => {
  const values = parse(readFileSync(new URL("../../v2/.env.local", import.meta.url)));
  const url = new URL((process.env.SPORTHOST_TEST_DATABASE_URL || values.DATABASE_URL).replace(/^postgresql\+psycopg:/, "postgresql:"));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_test"), "Operator tests require a disposable loopback *_test database");
  for (const key of ["sslmode", "sslcert", "sslrootcert", "sslkey", "channel_binding", "options"]) url.searchParams.delete(key);
  healthy = await inspectDatabase(url.toString());
  assert.equal(healthy.ok, true);
  assert.equal(healthy.read_only, true);
});

test("the reviewed physical payment schema passes a read-only inspection", () => {
  assert.deepEqual(paymentSchemaIssues(healthy), []);
  assert.equal(healthy.legacy_revision_ok, true);
  assert.ok(Object.values(healthy.privileges).every(Boolean));
  assert.ok(!JSON.stringify(healthy).includes("DATABASE_URL"));
});

test("a missing table or incompatible column blocks release", () => {
  assert.deepEqual(paymentSchemaIssues({ ok: true, payment_table_present: false }), ["payment_migration_missing"]);
  for (const change of [row => { row.data_type = "numeric"; }, row => { row.is_nullable = "YES"; }]) {
    const drift = structuredClone(healthy);
    change(drift.columns.find(row => row.column_name === "amount"));
    assert.ok(paymentSchemaIssues(drift).includes("payment_columns_mismatch"));
  }
});

test("duplicate-order protections must keep uniqueness and the exact active-state predicate", () => {
  for (const change of [value => value.replace("UNIQUE", ""), value => value.replace("'PENDING'", "'PAID'"), () => "CREATE UNIQUE INDEX wrong ON clubhost.payment_orders (club_id)"]) {
    const drift = structuredClone(healthy);
    const index = drift.indexes.find(row => row.indexname === "uq_payment_orders_active_club");
    index.indexdef = change(index.indexdef);
    assert.ok(paymentSchemaIssues(drift).includes("payment_index_mismatch:uq_payment_orders_active_club"));
  }
  const unusable = structuredClone(healthy);
  unusable.indexes.find(row => row.indexname === "uq_payment_orders_active_club").ready = false;
  assert.ok(paymentSchemaIssues(unusable).includes("payment_index_mismatch:uq_payment_orders_active_club"));
});

test("weaker amount/status checks and destructive foreign-key actions block release", () => {
  for (const [name, change] of [
    ["ck_payment_order_amount", value => value.replace("AND", "OR")],
    ["ck_payment_order_status", value => value.replace("'PAID'", "'paid'")],
    ["payment_orders_club_id_fkey", value => value.replace("SET NULL", "CASCADE")],
  ]) {
    const drift = structuredClone(healthy);
    const constraint = drift.constraints.find(row => row.conname === name);
    constraint.definition = change(constraint.definition);
    assert.ok(paymentSchemaIssues(drift).includes("payment_constraint_mismatch:" + name));
  }
});

test("unknown targets fail before reading operator credentials or starting SSH", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../check_nextjs_release.mjs", import.meta.url)), "--target", "arbitrary"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.writes, 0);
  assert.equal(report.error, "release_inspection_failed");
});
