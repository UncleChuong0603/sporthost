import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const preview = process.env.SPORTHOST_E2E_ORIGIN;
if (preview && preview !== "https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io") throw new Error("Browser writes are restricted to the explicitly authorized isolated preview");
const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
const database = process.env.SPORTHOST_TEST_DATABASE_URL || process.env.DATABASE_URL || local.DATABASE_URL;
if (!preview) {
  if (!database) throw new Error("Browser tests require a disposable loopback PostgreSQL database");
  const url = new URL(database);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Browser tests refuse remote or non-test databases");
}
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 60000,
  outputDir: preview ? "./test-results/preview" : "./test-results/local",
  expect: { timeout: 15000 },
  use: { baseURL: preview || "http://127.0.0.1:3100", actionTimeout: 15000, navigationTimeout: 30000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "mobile", use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 375, height: 812 } } },
  ],
  webServer: preview ? undefined : { command: "npm run start:standalone", url: "http://127.0.0.1:3100/health", env: { APP_URL: "http://127.0.0.1:3100", PORT: "3100", DATABASE_URL: database! }, reuseExistingServer: false, timeout: 60000 },
});
