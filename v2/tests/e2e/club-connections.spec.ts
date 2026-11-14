import { test, expect, type Page } from "@playwright/test";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";

const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function signup(page: Page, email: string) {
  await page.goto("/signup");
  const csrf = await page.locator('input[name="csrf"]').inputValue();
  expect((await page.request.post("/signup", { form: { csrf, email, password: "connection-e2e-password-123" }, headers: { Origin: origin }, maxRedirects: 0 })).status()).toBe(303);
  // Signup creates a new signed session; subsequent mutations need its bound CSRF token.
  expect((await page.goto("/account"))?.status()).toBe(200);
  return page.locator('input[name="csrf"]').first().inputValue();
}
async function createClub(page: Page, csrf: string, name: string) {
  const result = await page.request.post("/clubs", { form: { csrf, name }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(result.status()).toBe(303);
  return Number(new URL(result.headers().location).pathname.split("/").at(-1));
}
test("session drafts survive club changes and server errors while club context follows details and billing", async ({ page }, info) => {
  test.setTimeout(150000);
  const csrf = await signup(page, `v2-draft-${info.project.name}-${Date.now()}@example.com`);
  const first = await createClub(page, csrf, "Draft club A"), second = await createClub(page, csrf, "Draft club B");
  const pool = disposablePool();
  try { await pool.query("UPDATE clubhost.clubs SET fixed_fee=88000 WHERE id=$1", [second]); } finally { await pool.end(); }
  await page.goto(`/schedule/new?club_id=${first}`);
  await page.getByLabel("Tên buổi chơi", { exact: true }).fill("Keep my draft");
  await page.getByLabel("Địa điểm", { exact: true }).fill("Keep my venue");
  await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 86400000)));
  await page.getByLabel("Sức chứa", { exact: true }).fill("4");
  await page.locator('select[name="club_id"]').selectOption(String(second));
  await expect(page.getByLabel("Tên buổi chơi", { exact: true })).toHaveValue("Keep my draft");
  await expect(page.getByLabel("Địa điểm", { exact: true })).toHaveValue("Keep my venue");
  await expect(page.getByLabel("Sức chứa", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Phí thành viên cố định / người", { exact: true })).toHaveValue("88000");
  await page.getByText("Giới hạn và chính sách tham gia", { exact: true }).click();
  await page.getByLabel("Giới hạn nam", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click();
  const error = page.locator('form [role="alert"]');
  await expect(error).toContainText("Giới hạn nam/nữ không được vượt tổng sức chứa");
  await expect(error).toBeFocused();
  await expect(page.getByLabel("Tên buổi chơi", { exact: true })).toHaveValue("Keep my draft");
  await expect(page.getByLabel("Địa điểm", { exact: true })).toHaveValue("Keep my venue");
  await expect(page.getByLabel("Giới hạn nam", { exact: true })).toHaveValue("5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/session-draft-error-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("Giới hạn nam", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click();
  await expect(page).toHaveURL(/\/games\/\d+$/);
  const gamePath = new URL(page.url()).pathname;
  const nav = page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).filter({ visible: true });
  await expect(nav.getByRole("link", { name: "Thành viên", exact: true })).toHaveAttribute("href", `/members?club_id=${second}`);
  await expect(page.getByRole("link", { name: "← Lịch chơi", exact: true })).toHaveAttribute("href", `/schedule?club_id=${second}`);
  await page.goto(gamePath + "/billing");
  await expect(nav.getByRole("link", { name: "Thu chi", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Thu chi", exact: true })).toHaveAttribute("href", `/finance?club_id=${second}`);
});

test("owner invitation leads through signup to request, rejection, retry and explicit profile approval", async ({ page: owner, browser }, info) => {
  test.setTimeout(180000);
  const unique = `${info.project.name}-${Date.now()}`, playerEmail = `v2-connect-player-${unique}@example.com`;
  const csrf = await signup(owner, `v2-connect-owner-${unique}@example.com`);
  const club = await createClub(owner, csrf, "Connection club " + unique);
  expect((await owner.request.post(`/clubs/${club}/members`, { form: { csrf, name: "Player waiting to connect", phone: "0901177800", kind: "fixed", gender: "female" }, headers: { Origin: origin }, maxRedirects: 0 })).status()).toBe(303);
  const context = await browser.newContext({ baseURL: origin, viewport: info.project.use.viewport });
  const player = await context.newPage(), pool = disposablePool();
  try {
    await owner.goto(`/clubs/${club}/connections`);
    await owner.getByRole("button", { name: "Tạo liên kết mời", exact: true }).click();
    const invite = owner.getByLabel("Liên kết mời kết nối CLB", { exact: true });
    await expect(invite).toHaveValue(/^http/);
    const publicUrl = await invite.inputValue();
    await player.goto(publicUrl);
    await player.getByRole("link", { name: "Tạo tài khoản người chơi", exact: true }).click();
    await player.getByLabel("Email", { exact: true }).fill(playerEmail);
    await player.getByLabel("Mật khẩu", { exact: true }).fill("connection-e2e-password-123");
    await player.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
    await expect(player).toHaveURL(/\/me\/connect\/[A-Za-z0-9_-]{32}$/);
    await expect(player.getByText("Xác minh email trước khi gửi yêu cầu.", { exact: false })).toBeVisible();
    expect((await pool.query("SELECT count(*)::int AS n FROM clubhost.member_account_links l JOIN clubhost.hosts h ON h.id=l.account_id WHERE h.email=$1", [playerEmail])).rows[0].n).toBe(0);
    await pool.query("UPDATE clubhost.hosts SET email_verified=true WHERE email=$1", [playerEmail]);
    await player.reload();
    async function sendRequest() {
      await player.goto(publicUrl);
      await player.getByLabel("Họ tên để chủ CLB nhận ra bạn", { exact: true }).fill("Player waiting to connect");
      await player.getByRole("button", { name: "Gửi yêu cầu kết nối", exact: true }).click();
      await expect(player.getByText("Yêu cầu của bạn đang chờ chủ CLB duyệt.", { exact: false })).toBeVisible();
    }
    await sendRequest();
    await owner.goto("/dashboard");
    const tasks = owner.getByRole("region", { name: "Cần xử lý", exact: true });
    await expect(tasks.getByText("Kết nối người chơi chờ duyệt", { exact: false })).toBeVisible();
    await owner.goto(`/clubs/${club}/connections`);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await owner.screenshot({ path: `test-results/connection-pending-${info.project.name}.png`, fullPage: true });
    await owner.getByLabel("Lý do từ chối", { exact: true }).fill("Please confirm with the club owner");
    await owner.getByRole("button", { name: "Từ chối yêu cầu", exact: true }).click();
    await expect(owner.getByText("Chưa có yêu cầu kết nối đang chờ.", { exact: true })).toBeVisible();
    await player.goto("/me/connect");
    await expect(player.getByText("Please confirm with the club owner", { exact: true })).toBeVisible();
    await sendRequest();
    await owner.goto(`/clubs/${club}/connections`);
    await owner.getByRole("combobox", { name: "Hồ sơ thành viên cần liên kết", exact: true }).selectOption({ label: "Player waiting to connect · 0901177800" });
    await owner.getByRole("button", { name: "Duyệt và liên kết hồ sơ", exact: true }).click();
    await expect(owner.getByText("Chưa có yêu cầu kết nối đang chờ.", { exact: true })).toBeVisible();
    await player.goto("/me/profile");
    await expect(player.getByRole("heading", { name: "Player waiting to connect", exact: true })).toBeVisible();
    expect((await player.request.get(`/clubs/${club}/connections`)).status()).toBe(404);
    await owner.screenshot({ path: `test-results/connection-owner-${info.project.name}.png`, fullPage: true });
    await player.goto("/me/connect");
    await expect(player.getByText("Đã duyệt yêu cầu", { exact: true })).toBeVisible();
    expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await player.screenshot({ path: `test-results/connection-player-${info.project.name}.png`, fullPage: true });
    await owner.getByRole("button", { name: "Cấp liên kết mời mới", exact: true }).click();
    await expect(invite).not.toHaveValue(publicUrl);
    await player.goto(publicUrl);
    await expect(player.getByRole("heading", { name: "Lời mời không còn hoạt động", exact: true })).toBeVisible();
  } finally { await context.close(); await pool.end(); }
});
