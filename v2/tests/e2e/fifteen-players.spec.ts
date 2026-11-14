import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { localNow } from "../../src/domain/session-policy";
const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function token(page: Page, path: string) { await page.goto(path); return page.locator('input[name="csrf"]').first().inputValue(); }
async function native(request: APIRequestContext, path: string, values: URLSearchParams) {
  const response = await request.post(path, { data: values.toString(), headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0 });
  expect(response.status(), (await response.text()).slice(0, 180)).toBe(303); return response;
}
test("15 players retain whole groups and reconcile proof, partial bank, cash, refund and close with debt", async ({ page, browser }, info) => {
  test.setTimeout(240000);
  const csrf = await token(page, "/signup");
  await native(page.request, "/signup", new URLSearchParams({ csrf, email: `v2-fifteen-${info.project.name}-${Date.now()}@example.com`, password: "fifteen-players-password" }));
  const hostCsrf = await token(page, "/clubs/new");
  const created = await native(page.request, "/clubs", new URLSearchParams({ csrf: hostCsrf, name: "CLB 15 người" }));
  const clubId = created.headers().location.match(/\/clubs\/(\d+)/)![1];
  const result = await native(page.request, `/clubs/${clubId}/games`, new URLSearchParams({ csrf: hostCsrf, title: "Đủ 15 người, đối soát sau sân", starts_at: localNow(new Date(Date.now() + 7 * 86400000)), capacity: "15", guest_fee: "70000", approval_mode: "MANUAL_APPROVE" }));
  const gamePath = new URL(result.headers().location).pathname;
  await page.goto(gamePath); const publicPath = (await page.getByRole("link", { name: "Mở trang đăng ký công khai" }).getAttribute("href"))!;
  const contexts = await Promise.all([0, 1, 2, 3, 4].map(() => browser.newContext({ viewport: info.project.use.viewport })));
  try {
    const guests: Page[] = [];
    for (const [index, size] of [5, 4, 3, 3].entries()) {
      const guest = await contexts[index].newPage(); const guestCsrf = await token(guest, origin + publicPath);
      const form = new URLSearchParams({ csrf: guestCsrf, name: `Group ${index + 1}`, phone: `090234560${index}`, gender: "male" });
      for (let person = 1; person < size; person++) { form.append("companion_name", `Group ${index + 1} friend ${person}`); form.append("companion_gender", "female"); form.append("companion_level", "TB"); }
      await native(contexts[index].request, origin + publicPath, form);
      await guest.goto(origin + publicPath); await guest.getByRole("link", { name: "Xem đăng ký & thanh toán của tôi" }).click();
      await expect(guest).toHaveURL(/\/attend\/[^/]+$/); guests.push(guest);
    }
    await page.reload();
    for (let index = 0; index < 4; index++) {
      const article = page.locator('article[id^="booking-"]').filter({ has: page.getByRole("heading", { name: `Group ${index + 1}`, exact: false }) });
      await article.getByRole("button", { name: "Duyệt cả nhóm", exact: true }).click();
      await expect(article.getByText("Đã xác nhận", { exact: true })).toBeVisible();
    }
    await expect(page.getByText("15/15 chỗ", { exact: true })).toBeVisible();
    const extra = await contexts[4].newPage(); const extraCsrf = await token(extra, origin + publicPath);
    await native(contexts[4].request, origin + publicPath, new URLSearchParams({ csrf: extraCsrf, name: "Waiting group", phone: "0902345609", companion_name: "Waiting friend", companion_gender: "female" }));
    await extra.goto(origin + publicPath); await extra.getByRole("link", { name: "Xem đăng ký & thanh toán của tôi" }).click(); await expect(extra.getByText("Danh sách chờ", { exact: true })).toBeVisible();
    await page.reload(); await page.getByRole("button", { name: "Bắt đầu buổi chơi", exact: true }).click();
    const people = page.locator('li[id^="participant-"]'); await expect(people).toHaveCount(15);
    for (let index = 0; index < 15; index++) {
      const person = people.nth(index); await person.getByRole("button", { name: "Có mặt", exact: true }).click();
      await expect(person.locator("p").filter({ hasText: /^Có mặt$/ })).toBeVisible();
    }
    await page.getByRole("button", { name: "Kết thúc chơi", exact: true }).click();
    await page.getByRole("link", { name: "Thu chi và phát hành tiền cần đóng", exact: true }).click();
    await page.getByRole("button", { name: "Phát hành tiền cần đóng", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
    const payer = page.getByRole("region", { name: "Người thanh toán" }).getByRole("article").filter({ has: page.getByRole("heading", { name: "Group 1", exact: true }) });
    await expect(payer.getByText(/Phải đóng 350\.000đ/)).toBeVisible();
    const first = guests[0]; await first.reload();
    await first.getByText("Gửi biên nhận để host đối soát", { exact: true }).click();
    await first.getByLabel("Ảnh biên nhận", { exact: true }).setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: await sharp({ create: { width: 16, height: 16, channels: 3, background: "green" } }).png().toBuffer() });
    await first.getByLabel("Số tiền đã chuyển (đ)", { exact: true }).fill("300000");
    await first.getByRole("button", { name: "Gửi biên nhận", exact: true }).click();
    await expect(first.getByRole("status")).toContainText("Đã gửi biên nhận");
    await expect(first.getByText(/#\d+ · Đang chờ đối soát/)).toBeVisible();
    await expect(first.getByRole("region", { name: "Thanh toán của bạn" }).getByText("Chưa thu", { exact: true })).toBeVisible();
    await page.goto(`/payments/review?club_id=${clubId}`);
    await page.getByLabel("Số tiền thực nhận (đ)", { exact: true }).fill("300000");
    await page.getByRole("button", { name: "Host xác nhận tiền đã vào", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByText("Không có biên nhận đang chờ đối soát.", { exact: true })).toBeVisible();
    await page.goto(gamePath + "/billing");
    await payer.getByText("Ghi nhận tiền thực tế", { exact: true }).click();
    await payer.getByLabel("Số tiền của Group 1 (đ)", { exact: true }).fill("60000");
    await payer.getByRole("combobox", { name: "Kênh tiền của Group 1", exact: true }).selectOption("CASH");
    await payer.getByRole("button", { name: "Lưu giao dịch", exact: true }).click();
    await expect(payer.getByText("Thừa / cần hoàn", { exact: true })).toBeVisible();
    await payer.getByRole("combobox", { name: "Loại giao dịch của Group 1", exact: true }).selectOption("REFUND_RECORDED");
    await payer.getByLabel("Số tiền của Group 1 (đ)", { exact: true }).fill("10000");
    await payer.getByLabel("Lý do / ghi chú (bắt buộc khi hoàn)", { exact: true }).fill("Hoàn tiền thừa");
    await payer.getByRole("button", { name: "Lưu giao dịch", exact: true }).click();
    await expect(payer.getByText("Đã thu đủ", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Chốt sổ", exact: true }).click();
    await expect(page.getByText(/Đã phát hành · phiên bản 1 · đã chốt sổ/)).toBeVisible();
    await first.reload(); await expect(first.getByRole("region", { name: "Thanh toán của bạn" }).getByText("Đã thu đủ", { exact: true })).toBeVisible();
    await guests[1].reload(); await expect(guests[1].getByRole("region", { name: "Thanh toán của bạn" }).getByText("280.000đ", { exact: true })).toHaveCount(2);
    for (const current of [page, first, guests[1]]) expect(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
