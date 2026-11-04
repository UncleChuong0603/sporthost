import { test, expect } from "@playwright/test";
import { disposablePool } from "./disposable-db";

test("owner sees trial, promotion and verified payment state on desktop and mobile", async ({ page, request }, info) => {
  const email = `pro-browser-${info.project.name}-${Date.now()}@example.com`;
  const pool = disposablePool(); let clubId = 0;
  try {
    await page.goto("/signup");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("synthetic-browser-password");
    await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/clubs/new");
    await page.getByLabel("Tên câu lạc bộ").fill("CLB thử gói Pro");
    await page.getByRole("button", { name: "Tạo câu lạc bộ", exact: true }).click();
    await expect(page).toHaveURL(/\/clubs\/\d+$/);
    clubId = Number(new URL(page.url()).pathname.split("/").at(-1));
    await expect(page.getByRole("heading", { name: "Pro trial · còn 7 ngày" })).toBeVisible();
    await page.getByRole("link", { name: "Gói Pro & thanh toán" }).click();
    await expect(page.getByRole("heading", { name: "Bạn đang dùng thử Pro" })).toBeVisible();
    await expect(page.getByText("Ưu đãi ra mắt · giảm 51%", { exact: true })).toBeVisible();
    await expect(page.locator("s")).toHaveText("99.000đ");
    await expect(page.getByRole("button", { name: "Kích hoạt Pro · 49.000đ", exact: true })).toBeVisible();
    await expect(page.getByText("Tiết kiệm 50.000đ mỗi kỳ", { exact: true })).toBeVisible();
    await expect(page.getByText("Chưa có giao dịch.", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("subscription.png"), fullPage: true });
    await page.goto(`/clubs/${clubId}/subscription?payment=return&orderCode=123&status=PAID&amount=1`);
    await expect(page.getByRole("heading", { name: "Bạn đang dùng thử Pro" })).toBeVisible();
    expect((await pool.query("SELECT pro_ends_at FROM clubhost.clubs WHERE id=$1", [clubId])).rows[0].pro_ends_at).toBeNull();
    const forged = await request.post("/api/webhooks/payos", { data: { code: "00", success: true, desc: "success", data: { orderCode: 123, amount: 49000, paymentLinkId: "fake", currency: "VND", code: "00", description: "fake", accountNumber: "fake", reference: "fake", transactionDateTime: "fake", desc: "fake" }, signature: "0".repeat(64) } });
    expect(forged.status()).toBe(400);
    await pool.query("UPDATE clubhost.clubs SET trial_ends_at='2020-01-01T00:00:00Z' WHERE id=$1", [clubId]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Bạn đang dùng gói Cơ bản" })).toBeVisible();
    await page.getByText("Hết trial thì sao?", { exact: true }).click();
    await expect(page.getByText("CLB trở về Cơ bản, không tự động thu phí.", { exact: false })).toBeVisible();
    const anonymous = await request.get(`/clubs/${clubId}/subscription`, { headers: { Cookie: "" } });
    expect(anonymous.status()).toBe(401);
  } finally {
    if (clubId) { await pool.query("DELETE FROM clubhost.audit_logs WHERE club_id=$1", [clubId]); await pool.query("DELETE FROM clubhost.clubs WHERE id=$1", [clubId]); }
    await pool.query("DELETE FROM clubhost.hosts WHERE email=$1", [email]);
    await pool.end();
  }
});
