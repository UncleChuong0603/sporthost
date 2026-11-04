import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { localNow } from "../../src/domain/session-policy";

const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function csrf(page: Page, path: string) { expect((await page.goto(path))?.status()).toBe(200); return page.locator('input[name="csrf"]').first().inputValue(); }
async function post(request: APIRequestContext, path: string, token: string, form: Record<string, string>) {
  const result = await request.post(path, { form: { ...form, csrf: token }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(result.status(), `${path}: ${(await result.text()).slice(0, 120)}`).toBe(303); return result;
}

test("check-in cohost cannot read contacts, finance, capabilities, CSV or private images in HTML or RSC", async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const email = `v2-checker-${info.project.name}-${Date.now()}@example.com`;
  const checkerContext = await browser.newContext({ baseURL: origin, viewport: info.project.use.viewport });
  const guestContext = await browser.newContext({ baseURL: origin, viewport: info.project.use.viewport });
  try {
    const checker = await checkerContext.newPage(); const guest = await guestContext.newPage();
    await post(checker.request, "/signup", await csrf(checker, "/signup"), { email, password: "private-checker-password" });
    await post(page.request, "/signup", await csrf(page, "/signup"), { email: `v2-owner-${info.project.name}-${Date.now()}@example.com`, password: "private-owner-password" });
    const created = await post(page.request, "/clubs", await csrf(page, "/clubs/new"), { name: "Privacy boundary" });
    const club = Number(created.headers().location.match(/\/clubs\/(\d+)/)![1]); const token = await csrf(page, `/clubs/${club}`);
    const qrBuffer = await sharp({ create: { width: 16, height: 16, channels: 3, background: "orange" } }).png().toBuffer();
    const settings = await page.request.post(`/clubs/${club}/payment-settings`, { multipart: { csrf: token, bank_name: "PrivateBankMarker", account_number: "9876543210012", qr: { name: "qr.png", mimeType: "image/png", buffer: qrBuffer } }, headers: { Origin: origin }, maxRedirects: 0 });
    expect(settings.status()).toBe(303);
    const game = await post(page.request, `/clubs/${club}/games`, token, { title: "Cohost game", starts_at: localNow(new Date(Date.now() + 7 * 86400000)), capacity: "3", guest_fee: "91437", approval_mode: "AUTO_APPROVE" });
    const gamePath = new URL(game.headers().location).pathname; await page.goto(gamePath);
    const publicPath = (await page.getByRole("link", { name: "Mở trang đăng ký công khai" }).getAttribute("href"))!;
    const guestToken = await csrf(guest, publicPath);
    await post(guest.request, publicPath, guestToken, { name: "Private guest marker", phone: "0908877665", gender: "female" });
    await guest.goto(publicPath); await guest.getByRole("link", { name: "Xem đăng ký & thanh toán của tôi" }).click();
    await expect(guest).toHaveURL(/\/attend\/[^/]+$/);
    const privatePath = new URL(guest.url()).pathname;
    const uploaded = await guest.request.post(privatePath + "/proof", { multipart: { csrf: guestToken, proof: { name: "proof.png", mimeType: "image/png", buffer: qrBuffer } }, headers: { Origin: origin }, maxRedirects: 0 }); expect(uploaded.status(), await uploaded.text()).toBe(303);
    await page.goto(`/payments/review?club_id=${club}`); const proofPath = (await page.getByRole("link", { name: /^Mở ảnh biên nhận #/ }).getAttribute("href"))!;
    await post(page.request, `/clubs/${club}/cohosts`, token, { email, role: "custom", permissions: "check_in" });
    const forbidden = ["0908877665", "9876543210012", "PrivateBankMarker", "91437", "91.437", privatePath, privatePath.split("/").at(-1)!];
    for (const path of [gamePath, `/clubs/${club}`, "/dashboard"]) {
      for (const headers of [{ Accept: "text/html" }, { RSC: "1" }] as Record<string, string>[]) {
        const response = await checker.request.get(path, { headers }); expect(response.status(), path).toBe(200);
        const body = await response.text(); for (const value of forbidden) expect(body, path).not.toContain(value);
      }
    }
    for (const path of [gamePath + "/billing", gamePath + "/export.csv", `/finance?club_id=${club}`, `/finance/export.csv?club_id=${club}`, `/members?club_id=${club}`, `/clubs/${club}/qr`, `/payments/review?club_id=${club}`, proofPath]) {
      const result = await checker.request.get(path); expect(result.status(), path).toBe(403);
      expect(result.headers()["cache-control"]).toContain("no-store");
      for (const value of forbidden) expect(await result.text(), path).not.toContain(value);
    }
    await checker.goto(gamePath); await expect(checker.getByText("Private guest marker", { exact: true })).toBeVisible();
    await checker.getByRole("button", { name: "Có mặt", exact: true }).click();
    await expect(checker.getByText("Có mặt", { exact: true }).filter({ hasNot: checker.locator("button") }).first()).toBeVisible();
    const checkerToken = await checker.locator('input[name="csrf"]').first().inputValue();
    const forbiddenWrite = await checker.request.post(gamePath + "/walk-ins", { form: { csrf: checkerToken, name: "Forbidden", phone: "0901234098" }, headers: { Origin: origin } }); expect(forbiddenWrite.status()).toBe(403);
    await page.goto(`/clubs/${club}/access`);
    await page.getByRole("button", { name: "Thu hồi quyền", exact: true }).click();
    await expect(page.getByText("Chưa có đồng quản lý.", { exact: true })).toBeVisible();
    expect((await checker.request.get(gamePath)).status()).toBe(404);
    const denied = await checker.request.post(gamePath + "/toggle-open", { form: { csrf: checkerToken }, headers: { Origin: origin } }); expect(denied.status()).toBe(404);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await Promise.allSettled([checkerContext.close(), guestContext.close()]); }
});
