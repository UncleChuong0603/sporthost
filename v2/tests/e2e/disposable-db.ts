import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";

// Browser-only fixture preparation; never loaded into a runtime artifact.
export function disposablePool() {
  const preview = process.env.SPORTHOST_E2E_ORIGIN;
  let connectionString: string;
  if (preview) {
    if (preview !== "https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io") throw Error("Unauthorized browser fixture origin");
    const info = JSON.parse(readFileSync("../.vercel/nextjs/preview/state.private.json", "utf8"));
    connectionString = info.runtime_url;
    if (new URL(connectionString).pathname !== "/sporthost_v2_preview_c2905007") throw Error("Refused database fixture target");
  } else {
    connectionString = process.env.SPORTHOST_TEST_DATABASE_URL || process.env.DATABASE_URL || parse(readFileSync(".env.local")).DATABASE_URL;
    const url = new URL(connectionString);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw Error("Refused non-test browser database");
  }
  const url = new URL(connectionString); for (const key of ["sslmode", "channel_binding", "options", "sslrootcert"]) url.searchParams.delete(key);
  return new Pool({ connectionString: url.toString(), max: 1, ssl: preview ? { rejectUnauthorized: true } : false });
}
