import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config({ path: ".env.local" });

// Introspection is restricted to the disposable local baseline during migration.
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("Explicit isolated DATABASE_URL required");
const url = new URL(raw);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Introspection tooling requires a loopback *_test database");
}
export default defineConfig({
  dialect: "postgresql", schema: "./src/server/db/schema.ts",
  out: "./drizzle/introspected", schemaFilter: ["clubhost"],
  dbCredentials: { url: raw },
});
