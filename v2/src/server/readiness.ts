import "server-only";
import type { PoolClient } from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./db/schema";
import { memberAccountLinks } from "./db/member-schema";

const expected = [...Object.values(schema).filter(value => value !== schema.clubhost), memberAccountLinks].flatMap(table => {
  const config = getTableConfig(table as Parameters<typeof getTableConfig>[0]);
  return config.columns.map(column => config.name + "." + column.name);
});
export async function assertReady(client: PoolClient) {
  // information_schema is filtered by the current role's privileges. Check every
  // mapped column, including legacy auth, proofs, capacity and all money tables.
  const result = await client.query<{ name: string }>("SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema='clubhost'");
  const columns = new Set(result.rows.map(row => row.name));
  if (expected.some(name => !columns.has(name))) throw new Error("Incomplete clubhost schema or privileges");
  const baseline = await client.query("SELECT version_num FROM clubhost.alembic_version");
  if (baseline.rows.length !== 1 || baseline.rows[0].version_num !== "0011_fixed_member_fees") throw new Error("Unexpected baseline");
}
