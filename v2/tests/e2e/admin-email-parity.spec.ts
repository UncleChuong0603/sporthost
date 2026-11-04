import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";
const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function token(page: Page, path: string) { expect((await page.goto(path))?.status()).toBe(200); return page.locator('input[name="csrf"]').first().inputValue(); }
async function post(request: APIRequestContext, path: string, csrf: string, form: Record<string, string> = {}) {
  const response = await request.post(path, { form: { ...form, csrf }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(response.status(), `${path}: ${(await response.text()).slice(0, 140)}`).toBe(303); return response;
}
test("native one-use account links and persisted admin ledger keep legacy contracts on isolated data", async ({ page }, info) => {
  test.setTimeout(120000); const pool = disposablePool();
  const email = `v2-native-admin-${info.project.name}-${Date.now()}@example.com`; let hostId: number | undefined;
  try {
    await post(page.request, "/signup", await token(page, "/signup"), { email, password: "native-admin-password" });
    const csrf = await token(page, "/account"); hostId = (await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1", [email])).rows[0].id;
    expect((await page.request.get("/admin")).status()).toBe(403);
    expect((await page.request.post("/account/verify-email", { form: { csrf }, headers: { Origin: origin } })).status()).toBe(503);
    const verify = randomBytes(36).toString("base64url"), reset = randomBytes(36).toString("base64url");
    for (const [purpose, raw] of [["verify", verify], ["reset", reset]]) await pool.query("INSERT INTO clubhost.email_tokens(host_id,purpose,digest,expires_at,used) VALUES($1,$2,$3,$4,false)", [hostId, purpose, createHash("sha256").update(raw).digest("hex"), new Date(Date.now() + 600000).toISOString()]);
    expect((await page.request.get(`/verify-email?token=${verify}`)).status()).toBe(200);
    expect((await pool.query("SELECT used FROM clubhost.email_tokens WHERE digest=$1", [createHash("sha256").update(verify).digest("hex")])).rows[0].used).toBe(false);
    await post(page.request, "/verify-email", csrf, { token: verify });
    expect((await page.request.get(`/verify-email?token=${verify}`)).status()).toBe(400);
    await pool.query("UPDATE clubhost.hosts SET is_platform_admin=true WHERE id=$1 AND email=$2", [hostId, email]);
    expect((await page.request.get("/admin")).status()).toBe(200); expect((await page.request.get("/admin/platform-ledger")).status()).toBe(200);
    const clubResponse = await post(page.request, "/clubs", csrf, { name: "Admin parity isolated club" }); const club = clubResponse.headers().location.match(/\/clubs\/(\d+)/)![1];
    await post(page.request, `/admin/clubs/${club}/trial`, csrf, { days: "30" });
    const requestKey = randomBytes(20).toString("hex"); const entry = { entry_date: localNow().slice(0, 10), direction: "INCOME", category: "Native parity " + requestKey, amount: "99000", note: "Independent platform entry", request_key: requestKey };
    await post(page.request, "/admin/platform-ledger", csrf, entry); await post(page.request, "/admin/platform-ledger", csrf, entry);
    const entries = (await pool.query("SELECT id,amount,version FROM clubhost.platform_ledger_entries WHERE request_key=$1 AND created_by=$2", [requestKey, hostId])).rows; expect(entries).toHaveLength(1);
    await post(page.request, `/admin/platform-ledger/${entries[0].id}/edit`, csrf, { ...entry, version: "0", amount: "90000", reason: "Corrected real fixture" });
    const stale = await page.request.post(`/admin/platform-ledger/${entries[0].id}/edit`, { form: { ...entry, csrf, version: "0", amount: "88000", reason: "Stale" }, headers: { Origin: origin } }); expect(stale.status()).toBe(409);
    await page.goto("/admin/platform-ledger"); await expect(page.getByText(entry.category + " · Thu", { exact: true })).toBeVisible();
    await post(page.request, "/account/password", csrf, { current_password: "native-admin-password", password: "native-admin-changed-password", confirm_password: "native-admin-changed-password" });
    const currentCsrf = await token(page, "/account"); await post(page.request, "/logout", currentCsrf);
    const publicCsrf = await token(page, "/forgot-password");
    expect((await page.request.post("/forgot-password", { form: { csrf: publicCsrf, email }, headers: { Origin: origin } })).status()).toBe(503);
    expect((await page.request.get(`/reset-password?token=${reset}`)).status()).toBe(200);
    await post(page.request, "/reset-password", publicCsrf, { token: reset, password: "native-reset-password", confirm_password: "native-reset-password" });
    expect((await page.request.get(`/reset-password?token=${reset}`)).status()).toBe(400);
    await post(page.request, "/login", await token(page, "/login"), { email, password: "native-reset-password" });
    expect((await page.request.get("/admin")).status()).toBe(200);
  } finally {
    // Remove only this test account's temporary privilege; never bootstrap a real account.
    if (hostId) await pool.query("UPDATE clubhost.hosts SET is_platform_admin=false WHERE id=$1 AND email=$2", [hostId, email]);
    await pool.end();
  }
});
