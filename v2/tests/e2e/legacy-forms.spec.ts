import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { localNow } from "../../src/domain/session-policy";

const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function csrf(page: Page, source: string) { const response = await page.goto(source); expect(response?.status(), source).toBe(200); return page.locator('input[name="csrf"]').first().inputValue(); }
async function post(request: APIRequestContext, path: string, form: Record<string, string>, token: string) {
  const result = await request.post(path, { form: { ...form, csrf: token }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(result.status(), `${path}: ${(await result.text()).slice(0, 150)}`).toBe(303);
  return result;
}
test("legacy URLs accept native forms, private images and explicit manual money without a Python bridge", async ({ page, browser }, info) => {
  test.setTimeout(90000);
  const request = page.request;
  await post(request, "/signup", { email: `v2-native-${info.project.name}-${Date.now()}@example.com`, password: "native-forms-password-123" }, await csrf(page, "/signup"));
  const created = await post(request, "/clubs", { name: "Legacy native contracts" }, await csrf(page, "/clubs/new"));
  const club = Number(created.headers().location.match(/\/clubs\/(\d+)/)![1]);
  const clubToken = await csrf(page, `/clubs/${club}/settings`);
  const settings = await request.post(`/clubs/${club}/payment-settings`, { multipart: { csrf: clubToken, bank_name: "Test Bank", account_holder: "Test Host", account_number: "123456", payment_note: "Chuyen phi", qr: { name: "qr.png", mimeType: "image/png", buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: "blue" } }).png().toBuffer() } }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(settings.status(), await settings.text()).toBe(303);
  const game = await post(request, `/clubs/${club}/games`, { title: "Native booking", capacity: "2", starts_at: localNow(new Date(Date.now() + 86400000)), guest_fee: "70000", approval_mode: "AUTO_APPROVE" }, clubToken);
  const gamePath = new URL(game.headers().location).pathname;
  await page.goto(gamePath); const publicPath = await page.getByRole("link", { name: "Mở trang đăng ký công khai" }).getAttribute("href");
  const guestContext = await browser.newContext({ viewport: info.project.use.viewport });
  try {
    const guest = await guestContext.newPage(); const guestToken = await csrf(guest, origin + publicPath);
    const lookup = await guestContext.request.post(origin + publicPath + "/lookup", { form: { csrf: guestToken, phone: "0903216789" }, headers: { Origin: origin } });
    expect(lookup.status()).toBe(200); expect(await lookup.text()).toContain("Xác nhận đăng ký");
    const lookupToken = (await lookup.text()).match(/name="lookup_token" value="([^"]+)"/)![1];
    await post(guestContext.request, origin + publicPath, { name: "Guest native", phone: "0903216789", lookup_token: lookupToken }, guestToken);
    await guest.goto(origin + publicPath); await guest.getByRole("link", { name: "Xem đăng ký & thanh toán của tôi" }).click();
    await expect(guest).toHaveURL(/\/attend\/[^/]+$/);
    const privatePath = new URL(guest.url()).pathname;
    const qr = await guestContext.request.get(origin + privatePath + "/qr"); expect(qr.status()).toBe(200); expect(qr.headers()["content-type"]).toContain("image/png"); expect(qr.headers()["cache-control"]).toContain("no-store");
    await page.goto(gamePath); const gameToken = await page.locator('input[name="csrf"]').first().inputValue();
    const participantId = (await page.locator('li[id^="participant-"]').first().getAttribute("id"))!.split("-")[1];
    const bookingId = (await page.locator('article[id^="booking-"]').first().getAttribute("id"))!.split("-")[1];
    await post(request, gamePath + `/billing/bookings/${bookingId}/payer`, { mode: "SPLIT" }, gameToken);
    await post(request, gamePath + `/billing/bookings/${bookingId}/payer`, { mode: "GROUP" }, gameToken);
    await post(request, gamePath + `/billing/participants/${participantId}`, { exempt: "false", discount: "0", reason: "Giữ nguyên phí đã công bố" }, gameToken);
    await post(request, gamePath + "/expenses", { title: "Chi phí native", amount: "1000", category: "OTHER", allocated: "false" }, gameToken);
    await post(request, gamePath + "/lifecycle/start", {}, gameToken);
    await post(request, gamePath + `/participants/${participantId}/attendance`, { action: "check_in", version: "0" }, gameToken);
    await post(request, gamePath + "/lifecycle/finish", {}, gameToken);
    await page.goto(gamePath + "/billing");
    const draft = await page.locator('input[name="draft_hash"]').inputValue();
    await post(request, gamePath + "/billing/issue", { draft_hash: draft }, gameToken);
    await guest.reload(); const proofToken = await guest.locator('input[name="csrf"]').first().inputValue();
    const upload = await guestContext.request.post(origin + privatePath + "/proof", { multipart: { csrf: proofToken, reported_amount: "70000", proof: { name: "receipt.png", mimeType: "image/png", buffer: await sharp({ create: { width: 12, height: 12, channels: 3, background: "red" } }).png().toBuffer() } }, headers: { Origin: origin }, maxRedirects: 0 });
    expect(upload.status(), await upload.text()).toBe(303);
    await guest.reload(); await expect(guest.getByText(/#\d+ · Đang chờ đối soát/)).toBeVisible();
    await expect(guest.getByRole("region", { name: "Thanh toán của bạn" }).getByText("Chưa thu", { exact: true })).toBeVisible();
    await page.goto(`/payments/review?club_id=${club}`);
    const imagePath = await page.getByRole("link", { name: /^Mở ảnh biên nhận #/ }).getAttribute("href");
    const proofId = imagePath!.match(/\/proofs\/(\d+)\//)![1];
    expect((await request.get(imagePath!)).status()).toBe(200);
    expect((await guestContext.request.get(origin + imagePath)).status()).toBe(401);
    const reviewToken = await page.locator('input[name="csrf"]').first().inputValue();
    const absentAmount = await request.post(`/proofs/${proofId}/review`, { form: { csrf: reviewToken, action: "confirm" }, headers: { Origin: origin } }); expect(absentAmount.status()).toBe(400);
    await post(request, `/proofs/${proofId}/review`, { action: "confirm", received_amount: "30000" }, reviewToken);
    await guest.reload(); await expect(guest.getByText("Đã thu một phần", { exact: true })).toBeVisible();
    await expect(guest.getByRole("region", { name: "Thanh toán của bạn" }).getByText("40.000đ", { exact: true })).toBeVisible();
    const file = await request.get(gamePath + "/export.csv"); expect(file.status()).toBe(200); expect(await file.text()).toContain("Phí buổi (VND)"); expect(await file.text()).toContain("70000");
    const invalidOrigin = await request.post(gamePath + "/billing/close", { form: { csrf: gameToken }, headers: { Origin: "https://outside.invalid" } }); expect(invalidOrigin.status()).toBe(403);
    const moneyPath = gamePath + `/billing/bookings/${bookingId}/money`;
    const receipt = { kind: "RECEIVED", source: "CASH", amount: "50000", request_key: `native-cash-${Date.now()}` };
    await post(request, moneyPath, receipt, gameToken); await post(request, moneyPath, receipt, gameToken);
    await guest.reload(); await expect(guest.getByRole("region", { name: "Thanh toán của bạn" }).locator("p").filter({ hasText: /^Thừa \/ cần hoàn$/ })).toBeVisible();
    await post(request, moneyPath, { kind: "REFUND_RECORDED", source: "CASH", amount: "10000", request_key: `native-refund-${Date.now()}`, reason: "Hoàn khoản chuyển thừa" }, gameToken);
    await guest.reload(); await expect(guest.getByRole("region", { name: "Thanh toán của bạn" }).getByText("Đã thu đủ", { exact: true })).toBeVisible();
    await page.goto(gamePath + "/billing");
    const charge = await page.locator('input[name="charge_id"]').first().inputValue();
    await post(request, gamePath + "/billing/adjustments", { charge_id: charge, amount: "-1000", version: "1", request_key: `native-adjust-${Date.now()}`, reason: "Giảm có lý do sau đối soát" }, gameToken);
    await guest.reload(); await expect(guest.getByRole("region", { name: "Thanh toán của bạn" }).locator("p").filter({ hasText: /^Thừa \/ cần hoàn$/ })).toBeVisible();
    await post(request, gamePath + "/billing/close", {}, gameToken);
  } finally { await guestContext.close(); }
});
