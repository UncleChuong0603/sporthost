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
test("legacy and current guest keys preserve identity through edits, decisions, rotation and expiry", async ({ page, browser }, info) => {
  test.setTimeout(120000); const pool = disposablePool(); const visitorContext = await browser.newContext({ baseURL: origin, viewport: info.project.use.viewport });
  try {
    await post(page.request, "/signup", await token(page, "/signup"), { email: `v2-links-${info.project.name}-${Date.now()}@example.com`, password: "guest-links-password" });
    const csrf = await token(page, "/clubs/new"); const clubResponse = await post(page.request, "/clubs", csrf, { name: "Link parity" }); const club = clubResponse.headers().location.match(/\/clubs\/(\d+)/)![1];
    const created = await post(page.request, `/clubs/${club}/games`, csrf, { title: "Original URLs", capacity: "6", starts_at: localNow(new Date(Date.now() + 7 * 86400000)), guest_fee: "70000", approval_mode: "AUTO_APPROVE" });
    const gamePath = new URL(created.headers().location).pathname; const gameId = Number(gamePath.split("/").at(-1));
    await page.goto(gamePath); const publicPath = (await page.getByRole("link", { name: "Mở trang đăng ký công khai" }).getAttribute("href"))!;
    const visitor = await visitorContext.newPage(); const publicCsrf = await token(visitor, publicPath + "?source=facebook");
    await post(visitor.request, publicPath, publicCsrf, { name: "Link guest", phone: "0901122334", gender: "male", channel: "facebook_link" });
    await visitor.goto(publicPath); await visitor.getByRole("link", { name: "Xem đăng ký & thanh toán của tôi" }).click(); await expect(visitor).toHaveURL(/\/attend\/[^/]+$/);
    const currentPath = new URL(visitor.url()).pathname; const currentKey = currentPath.split("/").at(-1)!;
    const booking = (await pool.query("SELECT b.id,b.channel,b.fee_amount,b.token_digest,b.token_expires_at FROM clubhost.bookings b JOIN clubhost.game_sessions s ON s.id=b.session_id WHERE s.id=$1 AND s.club_id=$2", [gameId, club])).rows[0]; expect(booking.channel).toBe("facebook_link");
    const legacy = randomBytes(24).toString("base64url");
    await pool.query("UPDATE clubhost.bookings SET access_key=$1,legacy_token_digest=$2 WHERE id=$3 AND session_id=$4", [legacy, createHash("sha256").update(legacy).digest("hex"), booking.id, gameId]);
    expect((await visitor.request.get(`/attend/${legacy}`)).status()).toBe(200);
    expect((await visitor.request.get(currentPath)).status()).toBe(200);
    const preserved = (await pool.query("SELECT token_digest,token_expires_at,fee_amount FROM clubhost.bookings WHERE id=$1", [booking.id])).rows[0]; expect(preserved).toEqual({ token_digest: booking.token_digest, token_expires_at: booking.token_expires_at, fee_amount: booking.fee_amount });
    await post(visitor.request, `/attend/${legacy}/edit`, publicCsrf, { companion_name: "Legacy companion", companion_gender: "female", companion_level: "TB" });
    await post(visitor.request, currentPath + "/payer", publicCsrf, { mode: "SPLIT" });
    await post(visitor.request, currentPath + "/payer", publicCsrf, { mode: "GROUP" });
    await post(visitor.request, `/attend/${legacy}/cancel`, publicCsrf);
    expect((await pool.query("SELECT status FROM clubhost.bookings WHERE id=$1", [booking.id])).rows[0].status).toBe("cancelled");
    await post(visitor.request, publicPath, publicCsrf, { name: "Link guest", phone: "0901122334", gender: "male", channel: "facebook_link" });
    const path = gamePath + `/bookings/${booking.id}`;
    for (const action of ["waitlist", "approve", "reject", "approve", "cancel", "approve", "paid", "refund", "unpaid", "attended", "absent"]) await post(page.request, path + "/" + action, csrf, { reason: "Native compatibility fixture" });
    const before = (await pool.query("SELECT fee_amount FROM clubhost.bookings WHERE id=$1", [booking.id])).rows[0].fee_amount;
    await post(page.request, gamePath + "/settings", csrf, { title: "Original URLs revised", venue: "Court 8", change_reason: "Owner moved court" });
    expect((await pool.query("SELECT fee_amount FROM clubhost.bookings WHERE id=$1", [booking.id])).rows[0].fee_amount).toBe(before);
    await post(page.request, path + "/private-link/rotate", csrf);
    expect((await visitor.request.get(currentPath)).status()).toBe(404); expect((await visitor.request.get(`/attend/${legacy}`)).status()).toBe(404);
    await page.goto(gamePath); await page.getByText("Liên kết riêng của người chơi", { exact: true }).click(); const rotatedPath = (await page.getByRole("link", { name: "Mở đăng ký & thanh toán", exact: true }).getAttribute("href"))!;
    expect(rotatedPath).not.toBe(currentPath); expect((await visitor.request.get(rotatedPath)).status()).toBe(200);
    await post(page.request, path + "/private-link/revoke", csrf); expect((await visitor.request.get(rotatedPath)).status()).toBe(404);
    await post(page.request, path + "/private-link/rotate", csrf);
    await pool.query("UPDATE clubhost.bookings SET token_digest=$1,token_expires_at=$2 WHERE id=$3 AND session_id=$4", [createHash("sha256").update(currentKey).digest("hex"), new Date(Date.now() - 86400000).toISOString(), booking.id, gameId]);
    expect((await visitor.request.get(currentPath)).status()).toBe(404);
    await post(page.request, gamePath + "/cancel", csrf); await page.goto(gamePath); await expect(page.getByText("Đã hủy", { exact: true }).first()).toBeVisible();
    expect((await pool.query("SELECT fee_amount FROM clubhost.bookings WHERE id=$1", [booking.id])).rows[0].fee_amount).toBe(before);
  } finally { await Promise.allSettled([visitorContext.close(), pool.end()]); }
});
