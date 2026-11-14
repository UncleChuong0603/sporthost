import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readSheet } from "read-excel-file/node";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";

test("Free Excel downloads and independently opted-in Pro monthly reminders work on mobile and desktop", async ({ page }, info) => {
  test.setTimeout(120000);
  const pool = disposablePool(), email = `excel-monthly-${info.project.name}-${Date.now()}@example.com`;
  let account: number | undefined, club: number | undefined;
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    expect((await page.request.get("/members/export.xlsx?club_id=1")).status()).toBe(401);
    await page.goto("/signup"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Mật khẩu", { exact: true }).fill("excel-monthly-password-123"); await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
    account = (await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1", [email])).rows[0].id;
    await page.getByRole("button", { name: "Khám phá sau", exact: true }).click();
    await page.goto("/clubs/new"); await page.getByLabel("Tên câu lạc bộ", { exact: true }).fill("Excel monthly club"); await page.getByRole("button", { name: "Tạo câu lạc bộ", exact: true }).click(); await expect(page).toHaveURL(/\/clubs\/\d+$/); club = Number(new URL(page.url()).pathname.split("/").at(-1));
    await page.goto(`/members?club_id=${club}`); const form = page.getByRole("heading", { name: "Thêm thành viên · Excel monthly club", exact: true }).locator("..");
    await form.getByLabel("Họ tên", { exact: true }).fill("Ánh Excel"); await form.getByLabel("Số điện thoại", { exact: true }).fill("0907788991"); await form.getByRole("button", { name: "Thêm thành viên", exact: true }).click(); await expect(page.getByText("Ánh Excel", { exact: true })).toBeVisible();
    const member = (await pool.query("SELECT id FROM clubhost.members WHERE club_id=$1", [club])).rows[0].id;
    await pool.query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [club]); await page.reload();
    const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Xuất thành viên Excel", exact: true }).click(); const download = await downloaded; expect(download.suggestedFilename()).toBe("sporthost-thanh-vien.xlsx");
    const bytes = await readFile((await download.path())!); expect((await readSheet(bytes, 1))[1][2]).toBe("0907788991"); await expect(page.getByRole("status").filter({ hasText: "File Excel đã sẵn sàng" })).toBeVisible();
    const denial = await page.request.get("/members/export.xlsx?club_id=2147483647"); expect(denial.status()).toBe(404); expect(denial.headers()["cache-control"]).toContain("no-store");
    await page.goto(`/schedule/new?club_id=${club}`); await page.getByLabel("Tên buổi chơi", { exact: true }).fill("Export session"); await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 86400000))); await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click(); await expect(page).toHaveURL(/\/games\/\d+$/);
    const game = Number(new URL(page.url()).pathname.split("/").at(-1));
    const attendance = page.waitForEvent("download"); await page.getByRole("button", { name: "Xuất điểm danh Excel", exact: true }).click(); expect((await attendance).suggestedFilename()).toBe("sporthost-diem-danh.xlsx");
    const session = await page.request.get(`/games/${game}/export.xlsx`); expect(session.status()).toBe(200); expect((await readSheet(await session.body(), "Tổng quan")).some(r => r[1] === "Bản nháp — chưa phát hành")).toBe(true);
    await page.goto(`/finance?club_id=${club}&period=2030-06&status=unpaid`); const ledger = page.waitForEvent("download"); await page.getByRole("button", { name: "Xuất thu chi Excel", exact: true }).click(); expect((await ledger).suggestedFilename()).toBe("sporthost-thu-chi.xlsx");
    await page.goto(`/clubs/${club}/reminders`); await page.getByRole("checkbox", { name: "Nhắc phí tháng chưa đóng", exact: true }).check(); await page.getByRole("button", { name: "Lưu lịch nhắc", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "SportHost Pro" })).toBeVisible();
    await pool.query("UPDATE clubhost.clubs SET pro_ends_at=$2 WHERE id=$1", [club, new Date(Date.now() + 86400000 * 30).toISOString()]); await page.reload();
    await page.getByRole("checkbox", { name: "Nhắc phí tháng chưa đóng", exact: true }).check(); await page.getByLabel("Nhắc từ ngày trong tháng", { exact: true }).fill("10"); await page.getByLabel("Khoảng cách nhắc phí tháng (ngày)", { exact: true }).fill("4"); await page.getByRole("button", { name: "Lưu lịch nhắc", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Đã lưu lịch nhắc"); await page.reload(); await expect(page.getByRole("checkbox", { name: "Nhắc phí tháng chưa đóng", exact: true })).toBeChecked();
    await page.screenshot({ path: info.outputPath("monthly-settings.png"), fullPage: true });
    await pool.query("UPDATE clubhost.hosts SET email_verified=true WHERE id=$1", [account]);
    await page.goto("/me/notifications"); await expect(page.getByRole("checkbox", { name: /Nhận nhắc phí tháng/ })).not.toBeChecked();
    await page.getByRole("checkbox", { name: /Nhận nhắc phí tháng/ }).check(); await page.getByRole("button", { name: "Lưu tùy chọn", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Đã lưu tùy chọn"); await page.reload(); await expect(page.getByRole("checkbox", { name: /Nhận nhắc phí tháng/ })).toBeChecked(); await expect(page.getByRole("checkbox", { name: /Nhận nhắc RSVP/ })).not.toBeChecked();
    expect((await pool.query("SELECT monthly_enabled,monthly_day,monthly_interval_days FROM clubhost.reminder_settings WHERE club_id=$1", [club])).rows[0]).toMatchObject({ monthly_enabled: true, monthly_day: 10, monthly_interval_days: 4 });
    expect((await pool.query("SELECT 1 FROM clubhost.notifications WHERE due_id IN (SELECT id FROM clubhost.monthly_dues WHERE member_id=$1)", [member])).rowCount).toBe(0);
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    expect(errors).toEqual([]);
  } finally {
    if (club) { await pool.query("DELETE FROM clubhost.audit_logs WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.game_sessions WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.members WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.clubs WHERE id=$1", [club]); }
    if (account) { await pool.query("DELETE FROM clubhost.audit_logs WHERE host_id=$1", [account]); await pool.query("DELETE FROM clubhost.hosts WHERE id=$1", [account]); } await pool.end();
  }
});
