import { test, expect, type Page } from "@playwright/test";
import { localNow } from "../../src/domain/session-policy";

const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function token(page: Page, path: string) { await page.goto(path); return page.locator('input[name="csrf"]').first().inputValue(); }

test("host navigation, invitation sharing, pricing form and next steps work on desktop and mobile", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const signup = await page.request.post("/signup", { form: { csrf: await token(page, "/signup"), email: `v2-ux-${info.project.name}-${Date.now()}@example.com`, password: "workflow-password-123" }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(signup.status()).toBe(303);
  const created = await page.request.post("/clubs", { form: { csrf: await token(page, "/clubs/new"), name: "CLB trải nghiệm" }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(created.status()).toBe(303);
  const clubPath = new URL(created.headers().location).pathname;
  const clubId = clubPath.split("/").at(-1)!;
  await page.goto(`/schedule/new?club_id=${clubId}`);
  const nav = page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).filter({ visible: true });
  await expect(nav.getByRole("link", { name: "Lịch chơi", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Thành viên", exact: true })).toHaveAttribute("href", `/members?club_id=${clubId}`);
  const fees = page.getByRole("group", { name: "Giá và cách tính phí", exact: true });
  await expect(fees).toBeVisible();
  await fees.getByRole("combobox", { name: "Cách tính phí", exact: true }).selectOption("COST_SHARING");
  await expect(page.getByText(/Khoản mỗi người cần đóng được tính sau buổi chơi/)).toBeVisible();
  await fees.getByRole("combobox", { name: "Cách tính phí", exact: true }).selectOption("FIXED_PRICE");
  await page.getByLabel("Tên buổi chơi", { exact: true }).fill("Buổi chơi thứ bảy");
  await page.getByLabel("Địa điểm", { exact: true }).fill("Sân trung tâm");
  await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 86400000)));
  await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click();
  await expect(page).toHaveURL(/\/games\/\d+$/);
  const gamePath = new URL(page.url()).pathname;
  const progress = page.getByRole("region", { name: "Tiến trình buổi chơi", exact: true });
  await expect(progress.locator('[aria-current="step"]')).toHaveText(/Mời người/);
  const sharing = page.getByRole("region", { name: "Chia sẻ buổi chơi", exact: true });
  await expect(sharing.getByLabel("Liên kết đăng ký công khai", { exact: true })).toHaveValue(/^https?:\/\//);
  const publicUrl = await sharing.getByLabel("Liên kết đăng ký công khai", { exact: true }).inputValue();
  expect(publicUrl).toMatch(new RegExp("^" + origin.replaceAll(".", "\\.") + "/join/[A-Za-z0-9_-]+$"));
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as unknown as { copied: string }).copied = value; } } });
  });
  await sharing.getByRole("button", { name: "Sao chép liên kết", exact: true }).click();
  await expect(sharing.getByRole("status")).toHaveText("Đã sao chép liên kết đăng ký.");
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(publicUrl);
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Permission denied"); } } }); });
  await sharing.getByRole("button", { name: "Sao chép liên kết", exact: true }).click();
  await expect(sharing.getByLabel("Liên kết đăng ký công khai", { exact: true })).toBeFocused();
  await expect(sharing.getByRole("status")).toContainText("Hãy sao chép liên kết");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("User cancelled", "AbortError"); } });
  });
  await page.reload();
  await sharing.getByRole("button", { name: "Chia sẻ lời mời", exact: true }).click();
  await expect(sharing.getByRole("status")).toHaveText("");
  await page.evaluate(() => { Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } }); });
  await sharing.getByRole("button", { name: "Chia sẻ lời mời", exact: true }).click();
  await expect(sharing.getByRole("status")).toContainText("Chưa chia sẻ được");
  const widths = [375, 812, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const visibleNav = page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).filter({ visible: true });
    await expect(visibleNav.getByRole("link", { name: "Lịch chơi", exact: true })).toHaveAttribute("aria-current", "page");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize(info.project.use.viewport || { width: 1280, height: 720 });
  await page.screenshot({ path: `test-results/host-workflow-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Bắt đầu buổi chơi", exact: true }).click();
  await expect(progress.locator('[aria-current="step"]')).toHaveText(/Điểm danh/);
  await expect(sharing).toHaveCount(0);
  await page.getByRole("button", { name: "Kết thúc chơi", exact: true }).click();
  await expect(progress.locator('[aria-current="step"]')).toHaveText(/Tính phí/);
  await page.goto("/dashboard");
  const tasks = page.getByRole("region", { name: "Cần xử lý", exact: true });
  await expect(tasks.getByText("Buổi cần hoàn tất", { exact: false })).toBeVisible();
  await tasks.getByRole("link", { name: /Buổi chơi thứ bảy/ }).click();
  await expect(page).toHaveURL(gamePath + "/billing");
  expect(errors).toEqual([]);
});
