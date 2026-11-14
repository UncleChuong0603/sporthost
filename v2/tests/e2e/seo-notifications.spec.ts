import { test, expect, type Page } from "@playwright/test";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";
const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function csrf(page: Page, path: string) { await page.goto(path); return page.locator('input[name="csrf"]').first().inputValue(); }
async function post(page: Page, path: string, token: string, data: Record<string, string> = {}) {
  const response = await page.request.post(path, { form: { csrf: token, ...data }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(response.status()).toBe(303); return response;
}
test("public SEO pages stay crawl-safe on preview and retain Facebook metadata", async ({ page, request }) => {
  for (const [path, heading] of [["/tinh-nang", "Quản lý câu lạc bộ thể thao"], ["/bang-gia", "Chọn gói theo cách CLB"]]) {
    const response = await page.goto(path); expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://sporthost.online" + path);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://sporthost.online/images/sporthost-share-v1.png");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  }
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("<loc>");
  for (const path of ["/login", "/me/login", "/account"]) expect((await request.get(path)).headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.post("/api/internal/reminders")).status()).toBe(401);
});

test("notifications, opt-in settings and payment copy work on desktop and mobile", async ({ page: owner, browser }, info) => {
  test.setTimeout(120000);
  const pool = disposablePool(), context = await browser.newContext({ baseURL: origin, viewport: info.project.use.viewport, permissions: ["clipboard-read", "clipboard-write"] });
  const player = await context.newPage(); const unique = `${info.project.name}-${Date.now()}`;
  const playerEmail = `v2-notify-${unique}@example.com`, playerName = "Người chơi thông báo";
  let clubId: number | undefined;
  try {
    await post(owner, "/signup", await csrf(owner, "/signup"), { email: `v2-notify-owner-${unique}@example.com`, password: "notification-owner-password" });
    const token = await csrf(owner, "/clubs"), created = await post(owner, "/clubs", token, { name: "CLB thông báo " + unique });
    const clubPath = new URL(created.headers().location).pathname; clubId = Number(clubPath.split("/").at(-1));
    await post(owner, clubPath + "/members", token, { name: playerName, phone: "0907788990", kind: "fixed" });
    const memberId = (await pool.query("SELECT id FROM clubhost.members WHERE club_id=$1", [clubId])).rows[0].id;
    await post(player, "/signup", await csrf(player, "/me/signup"), { email: playerEmail, password: "notification-player-password" });
    await pool.query("UPDATE clubhost.hosts SET email_verified=true WHERE email=$1", [playerEmail]);
    await owner.goto(`/members?club_id=${clubId}`); const row = owner.getByRole("listitem").filter({ has: owner.getByText(playerName, { exact: true }) });
    await row.getByText(`Tài khoản người chơi ${playerName}`, { exact: true }).click(); await row.getByLabel("Email tài khoản thành viên", { exact: true }).fill(playerEmail);
    await row.getByRole("button", { name: "Liên kết tài khoản", exact: true }).click(); await expect(row.getByText(playerEmail, { exact: true })).toBeVisible();
    const game = await post(owner, clubPath + "/games", token, { title: "Buổi có thông báo", starts_at: localNow(new Date(Date.now() + 86400000)), capacity: "10" });
    const gamePath = new URL(game.headers().location).pathname;
    await post(owner, gamePath + "/invite-fixed", token);
    await player.goto("/me/notifications"); await expect(player.getByText("Bạn có lời mời tham gia buổi chơi", { exact: true })).toBeVisible();
    await expect(player.getByRole("link", { name: /Thông báo, 1 chưa đọc/ })).toBeVisible();
    await player.screenshot({ path: info.outputPath("notifications.png"), fullPage: true });
    await player.getByRole("checkbox", { name: /Nhận nhắc RSVP/ }).check(); await player.getByRole("button", { name: "Lưu tùy chọn", exact: true }).click();
    await expect(player.getByText("Đã lưu tùy chọn nhắc việc.")).toBeVisible(); await player.reload(); await expect(player.getByRole("checkbox", { name: /Nhận nhắc RSVP/ })).toBeChecked();
    await player.getByRole("button", { name: "Đánh dấu tất cả đã đọc", exact: true }).click(); await expect(player.getByText("Đã đánh dấu các thông báo là đã đọc.")).toBeVisible();
    await player.reload(); await expect(player.getByRole("link", { name: "Thông báo", exact: true })).toBeVisible();
    await owner.goto(clubPath + "/reminders"); await owner.getByRole("checkbox", { name: "Nhắc trả lời lời mời RSVP", exact: true }).check();
    await owner.getByRole("button", { name: "Lưu lịch nhắc", exact: true }).click(); await expect(owner.getByText("Đã lưu lịch nhắc trong ứng dụng.")).toBeVisible();
    expect((await player.request.get(clubPath + "/reminders")).status()).toBe(404);
    await owner.screenshot({ path: info.outputPath("club-reminders.png"), fullPage: true });
    await post(owner, clubPath + "/payment-settings", token, { bank_name: "Ngân hàng test", account_holder: "CLB TEST", account_number: "123456789012", payment_note: "SPORTHOST TEST" });
    await post(owner, clubPath + "/dues", token, { member_id: String(memberId), period: "2026-12", amount: "100000" });
    const dueId = (await pool.query("SELECT id FROM clubhost.monthly_dues WHERE member_id=$1", [memberId])).rows[0].id;
    await player.goto(`/me/dues/${dueId}`); await player.getByRole("button", { name: "Sao chép số tài khoản", exact: true }).click();
    await expect(player.getByText("Đã sao chép.", { exact: true })).toBeVisible(); expect(await player.evaluate(() => navigator.clipboard.readText())).toBe("123456789012");
    await player.getByRole("button", { name: "Sao chép nội dung chuyển khoản", exact: true }).click(); expect(await player.evaluate(() => navigator.clipboard.readText())).toBe("SPORTHOST TEST");
    for (const path of ["/me/notifications", `/me/dues/${dueId}`]) { await player.goto(path); expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await player.screenshot({ path: info.outputPath("payment-copy.png"), fullPage: true });
  } finally {
    if (clubId) {
      await owner.goto(`/clubs/${clubId}`); const token = await owner.locator('input[name="csrf"]').first().inputValue();
      await post(owner, `/clubs/${clubId}/delete`, token, { confirmation_name: "CLB thông báo " + unique });
    }
    await context.close(); await pool.end();
  }
});
