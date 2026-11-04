import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";
const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function token(page: Page, path: string) { expect((await page.goto(path))?.status()).toBe(200); return page.locator('input[name="csrf"]').first().inputValue(); }
async function post(request: APIRequestContext, path: string, csrf: string, form: Record<string, string> = {}) {
  const response = await request.post(path, { form: { ...form, csrf }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(response.status(), `${path}: ${(await response.text()).slice(0, 140)}`).toBe(303); return response;
}
test("native member creation, cohost removal, monthly toggle and private QR/export retain HTTP contracts", async ({ page, browser }, info) => {
  test.setTimeout(90000); const pool = disposablePool(); const checkerContext = await browser.newContext({ baseURL: origin, viewport: info.project.use.viewport });
  try {
    const email = `v2-native-checker-${info.project.name}-${Date.now()}@example.com`; const checker = await checkerContext.newPage();
    await post(checker.request, "/signup", await token(checker, "/signup"), { email, password: "native-checker-password" });
    await post(page.request, "/signup", await token(page, "/signup"), { email: `v2-native-settings-${info.project.name}-${Date.now()}@example.com`, password: "native-settings-password" });
    const csrf = await token(page, "/clubs"); const created = await post(page.request, "/clubs", csrf, { name: "Native settings and exports" }); const clubPath = new URL(created.headers().location).pathname; const club = Number(clubPath.split("/").at(-1));
    await post(page.request, clubPath + "/members", csrf, { name: "Monthly native", phone: "0901144556", gender: "female", kind: "fixed" });
    const member = (await pool.query("SELECT id FROM clubhost.members WHERE club_id=$1 AND phone='0901144556'", [club])).rows[0].id;
    const buffer = await sharp({ create: { width: 12, height: 12, channels: 3, background: "black" } }).png().toBuffer();
    const qr = await page.request.post(clubPath + "/payment-settings", { multipart: { csrf, bank_name: "Native bank", qr: { name: "qr.png", mimeType: "image/png", buffer } }, headers: { Origin: origin }, maxRedirects: 0 }); expect(qr.status()).toBe(303);
    const media = await page.request.get(clubPath + "/qr"); expect(media.status()).toBe(200); expect(media.headers()["cache-control"]).toContain("no-store");
    const period = localNow().slice(0, 7); await post(page.request, clubPath + "/dues", csrf, { member_id: String(member), period, amount: "250000" });
    const due = (await pool.query("SELECT id,paid FROM clubhost.monthly_dues WHERE member_id=$1 AND period=$2", [member, period])).rows[0]; expect(due.paid).toBe(false);
    await post(page.request, `/dues/${due.id}/toggle`, csrf); expect((await pool.query("SELECT paid FROM clubhost.monthly_dues WHERE id=$1", [due.id])).rows[0].paid).toBe(true);
    const exported = await page.request.get(`/finance/export.csv?club_id=${club}&period=${period}`); expect(exported.status()).toBe(200); const body = await exported.text(); expect(body).toContain("Monthly native"); expect(body).toContain("250000"); expect(exported.headers()["cache-control"]).toContain("no-store");
    await post(page.request, `/dues/${due.id}/toggle`, csrf); expect((await pool.query("SELECT paid FROM clubhost.monthly_dues WHERE id=$1", [due.id])).rows[0].paid).toBe(false);
    await post(page.request, clubPath + "/cohosts", csrf, { email, role: "custom", permissions: "check_in" });
    const access = (await pool.query("SELECT a.id FROM clubhost.club_access a JOIN clubhost.hosts h ON h.id=a.host_id WHERE a.club_id=$1 AND h.email=$2", [club, email])).rows[0].id;
    expect((await checker.request.get(clubPath)).status()).toBe(200);
    await post(page.request, clubPath + `/cohosts/${access}/remove`, csrf); expect((await checker.request.get(clubPath)).status()).toBe(404);
    expect((await page.request.get(clubPath + "/settings")).status()).toBe(200);
  } finally { await Promise.allSettled([checkerContext.close(), pool.end()]); }
});
