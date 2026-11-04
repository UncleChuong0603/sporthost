import "server-only";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";

const globalPg = globalThis as unknown as { sporthostPool?: Pool; sporthostPoolKey?: string };
export function getPool() {
  const config = getConfig();
  const url = new URL(config.databaseUrl);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  // Parse TLS deliberately; pg-connection-string must not override SSL verification.
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "options", "channel_binding"]) url.searchParams.delete(key);
  const key = config.databaseUrl + "|" + config.APP_READ_ONLY + "|" + config.DATABASE_POOL_MAX;
  if (globalPg.sporthostPool && globalPg.sporthostPoolKey !== key) throw new Error("Database config changed; restart server");
  if (!globalPg.sporthostPool) {
    const pool = new Pool({ connectionString: url.toString(), max: config.DATABASE_POOL_MAX,
      connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
      ssl: loopback && !config.deployed ? false : { rejectUnauthorized: true },
      options: config.APP_READ_ONLY ? "-c default_transaction_read_only=on" : undefined,
      application_name: "sporthost-v2" });
    pool.on("error", () => { /* Pool replaces failed idle connections. No raw error logging. */ });
    globalPg.sporthostPool = pool;
    globalPg.sporthostPoolKey = key;
  }
  return globalPg.sporthostPool;
}

export function getDb() { return drizzle(getPool()); }
export async function transaction<T>(run: (client: PoolClient) => Promise<T>, options: { readOnly?: boolean } = {}) {
  if (!options.readOnly && getConfig().APP_READ_ONLY) throw new AppError(503, "Ứng dụng đang chỉ đọc trong lúc kiểm tra triển khai.", "read_only");
  const client = await getPool().connect();
  try {
    await client.query(options.readOnly ? "BEGIN READ ONLY" : "BEGIN");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const value = await run(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function closePool() {
  const pool = globalPg.sporthostPool;
  delete globalPg.sporthostPool;
  delete globalPg.sporthostPoolKey;
  if (pool) await pool.end();
}
