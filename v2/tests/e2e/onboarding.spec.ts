import { test, expect, type Page } from "@playwright/test";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";

async function signup(page: Page, email: string) {
  await page.goto("/signup"); await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("onboarding-password-123");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function cleanup(email: string) {
  const pool = disposablePool();
  try {
    const account = (await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1", [email])).rows[0]?.id;
    if (!account) return;
    // Only the disposable fixtures of this test; no financial records are made.
    await pool.query("DELETE FROM clubhost.audit_logs WHERE host_id=$1", [account]);
    await pool.query("DELETE FROM clubhost.game_sessions WHERE club_id IN (SELECT id FROM clubhost.clubs WHERE owner_id=$1)", [account]);
    await pool.query("DELETE FROM clubhost.members WHERE club_id IN (SELECT id FROM clubhost.clubs WHERE owner_id=$1)", [account]);
    await pool.query("DELETE FROM clubhost.clubs WHERE owner_id=$1", [account]);
    await pool.query("DELETE FROM clubhost.hosts WHERE id=$1", [account]);
  } finally { await pool.end(); }
}
test("first host: dismiss, resume across routes/reload, real setup, failed and successful sharing", async ({ page }, info) => {
  test.setTimeout(120000);
  const email = `v2-tour-e2e-${info.project.name}-${Date.now()}@example.com`, errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("Cancelled", "AbortError"); } }));
  try {
    await signup(page, email);
    await expect(page.getByRole("heading", { name: "CLB đầu tiên, từng bước dễ làm" })).toBeVisible();
    await page.getByRole("button", { name: "Khám phá sau", exact: true }).click();
    await expect(page.getByRole("button", { name: "Khám phá sau", exact: true })).toBeHidden();
    await page.reload(); await expect(page.getByRole("button", { name: "Khám phá sau", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    const help = page.getByRole("dialog", { name: "Hướng dẫn cho host" });
    await help.getByRole("button", { name: "Tiếp tục thiết lập", exact: true }).click();
    await expect(page).toHaveURL(/\/clubs\/new$/);
    await expect(page.getByRole("complementary", { name: "Hướng dẫn thao tác" })).toBeVisible();
    await page.reload(); await expect(page.getByRole("complementary", { name: "Hướng dẫn thao tác" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const target = document.querySelector('[data-tour="club-name"]')!.getBoundingClientRect();
      const tooltip = document.querySelector('[aria-label="Hướng dẫn thao tác"]')!.getBoundingClientRect();
      return tooltip.left < target.right && tooltip.right > target.left && tooltip.top < target.bottom && tooltip.bottom > target.top;
    })).toBe(false);
    await page.screenshot({ path: `test-results/onboarding-spotlight-${info.project.name}.png` });
    await page.getByLabel("Tên câu lạc bộ", { exact: true }).fill("CLB onboarding " + info.project.name);
    await page.getByRole("button", { name: "Tạo câu lạc bộ", exact: true }).click();
    await expect(page).toHaveURL(/\/clubs\/\d+$/);
    const tooltip = page.getByRole("complementary", { name: "Hướng dẫn thao tác" });
    await expect(tooltip.getByRole("heading")).toHaveText("Tạo buổi chơi đầu tiên");
    await tooltip.getByRole("link", { name: "Đi tới thao tác" }).click();
    await expect(page).toHaveURL(/\/schedule\/new\?club_id=/);
    await page.getByLabel("Tên buổi chơi", { exact: true }).fill("Buổi chơi thật của CLB");
    await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 86400000)));
    await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click();
    await expect(page).toHaveURL(/\/games\/\d+$/);
    await expect(tooltip.getByRole("heading")).toHaveText("Sẵn sàng mời người chơi");
    await page.getByRole("button", { name: "Chia sẻ lời mời", exact: true }).click();
    expect((await (await page.request.get("/api/onboarding")).json()).progress.find((p: { id: string }) => p.id === "share").done).toBe(false);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw Error("Denied"); } } }));
    await page.getByRole("button", { name: "Sao chép liên kết", exact: true }).click();
    await expect(page.getByText("Chưa sao chép tự động được.", { exact: false })).toBeVisible();
    let snapshot = await (await page.request.get("/api/onboarding")).json();
    expect(snapshot.progress.find((p: { id: string }) => p.id === "share").done).toBe(false);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
    // The guide may pause to keep a focused fallback field unobscured. Copy still records a real success.
    await page.getByRole("button", { name: "Sao chép liên kết", exact: true }).click();
    await expect.poll(async () => {
      snapshot = await (await page.request.get("/api/onboarding")).json();
      return snapshot.progress.find((p: { id: string }) => p.id === "share").done;
    }).toBe(true);
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    await expect(help.getByText("Thiết lập CLB · 3/3 nhiệm vụ hoàn tất")).toBeVisible();
    await help.getByRole("button", { name: "Đóng hướng dẫn", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/onboarding-complete-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    await help.getByRole("listitem").filter({ hasText: "Quản lý thành viên" }).getByRole("button", { name: "Hướng dẫn thao tác", exact: true }).click();
    await expect(page).toHaveURL(/\/members\?club_id=/);
    await page.getByLabel("Họ tên", { exact: true }).fill("Thành viên CLB");
    await page.getByLabel("Số điện thoại", { exact: true }).fill("0904455667");
    await page.getByRole("button", { name: "Thêm thành viên", exact: true }).click();
    await expect.poll(async () => (await (await page.request.get("/api/onboarding")).json()).progress.find((p: { id: string }) => p.id === "members").done).toBe(true);
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    const memberMission = help.getByRole("listitem").filter({ hasText: "Quản lý thành viên" });
    await memberMission.getByRole("button", { name: "Xem lại hướng dẫn", exact: true }).click();
    await expect(tooltip.getByText("Đã hoàn tất · Bạn đang xem lại hướng dẫn.")).toBeVisible();
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    await help.getByRole("listitem").filter({ hasText: "Mời thành viên cố định" }).getByRole("button", { name: "Hướng dẫn thao tác", exact: true }).click();
    await expect(page).toHaveURL(/\/games\/\d+$/);
    await tooltip.getByRole("button", { name: "Bỏ qua bước này", exact: true }).click();
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    await expect(help.getByRole("listitem").filter({ hasText: "Mời thành viên cố định" }).getByText("Đã bỏ qua · chưa hoàn tất")).toBeVisible();
    await help.getByRole("button", { name: "Bắt đầu lại", exact: true }).click();
    await expect.poll(async () => {
      snapshot = await (await page.request.get("/api/onboarding")).json();
      return snapshot.progress.find((p: { id: string }) => p.id === "invitations").skipped;
    }).toBe(false);
    expect(snapshot.progress.find((p: { id: string }) => p.id === "members").done).toBe(true);
    expect(errors).toEqual([]);
  } finally { await cleanup(email); }
});

test("missing target, keyboard pause, CSRF rejection and responsive normal usage", async ({ page, request }, info) => {
  const email = `v2-tour-keyboard-${info.project.name}-${Date.now()}@example.com`;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await request.get("/api/onboarding")).status()).toBe(401);
    await signup(page, email); await page.getByRole("button", { name: "Bắt đầu hướng dẫn", exact: true }).click();
    const tooltip = page.getByRole("complementary", { name: "Hướng dẫn thao tác" });
    await expect(tooltip.getByText("Mục này chưa hiện ở trang hiện tại.", { exact: false })).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(tooltip).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const box = await tooltip.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.keyboard.press("Escape"); await expect(tooltip).toBeHidden();
    await expect(page.getByRole("button", { name: "Hướng dẫn", exact: true })).toBeFocused();
    await page.reload(); await expect(tooltip).toBeHidden();
    const snapshot = await (await page.request.get("/api/onboarding")).json();
    expect(snapshot.status).toBe("paused"); expect(snapshot.progress.some((p: { done: boolean }) => p.done)).toBe(false);
    const denied = await page.request.post("/api/onboarding", { data: { action: "start", revision: snapshot.revision, clubId: null } });
    expect(denied.status()).toBe(403);
    await page.getByRole("button", { name: "Hướng dẫn", exact: true }).click();
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeHidden();
    await page.goto("/clubs/new"); await expect(page.getByLabel("Tên câu lạc bộ", { exact: true })).toBeEditable();
  } finally { await cleanup(email); }
});
