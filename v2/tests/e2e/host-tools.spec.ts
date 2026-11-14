import { test, expect } from "@playwright/test";
import { disposablePool } from "./disposable-db";
import { memberHeaders, memberWorkbook } from "../xlsx-fixture";
import { localNow } from "../../src/domain/session-policy";
test("Excel preview/confirm and Free session copying preserve existing records", async ({ page }, info) => {
  test.setTimeout(120000);
  const pool = disposablePool(), email = `v2-excel-${info.project.name}-${Date.now()}@example.com`;
  let account: number | undefined, club: number | undefined;
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("/signup"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Mật khẩu", { exact: true }).fill("excel-test-password-123"); await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    account = (await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1", [email])).rows[0].id;
    await page.getByRole("button", { name: "Khám phá sau", exact: true }).click();
    await page.goto("/clubs/new"); await page.getByLabel("Tên câu lạc bộ", { exact: true }).fill("Excel club"); await page.getByRole("button", { name: "Tạo câu lạc bộ", exact: true }).click(); await expect(page).toHaveURL(/\/clubs\/\d+$/); club = Number(new URL(page.url()).pathname.split("/").at(-1));
    await page.goto(`/members?club_id=${club}`);
    const importer = page.getByRole("region", { name: "Nhập thành viên từ Excel · Excel club" });
    const template = await page.request.get("/templates/thanh-vien-sporthost.xlsx"); expect(template.status()).toBe(200); expect((await template.body()).subarray(0, 2).toString()).toBe("PK");
    await importer.getByLabel("File danh sách thành viên").setInputFiles({ name: "members.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: memberWorkbook([memberHeaders, ["An", "0901122334", "Cố định", "Nam", "Khá"], ["Duplicate", "84901122334"], ["Invalid", "wrong"]]) });
    await importer.getByRole("button", { name: "Xem trước danh sách", exact: true }).click(); await expect(importer.getByRole("heading", { name: "Xem trước · 1 hợp lệ · 1 lỗi · 1 trùng" })).toBeVisible();
    expect((await pool.query("SELECT 1 FROM clubhost.members WHERE club_id=$1", [club])).rowCount).toBe(0);
    const commit = importer.getByRole("button", { name: "Nhập 1 thành viên hợp lệ", exact: true }); await expect(commit).toBeDisabled();
    await importer.getByRole("checkbox").check(); await commit.click(); await expect(importer.getByRole("status")).toContainText("Đã thêm 1 thành viên");
    expect((await pool.query("SELECT 1 FROM clubhost.members WHERE club_id=$1", [club])).rowCount).toBe(1);
    await page.screenshot({ path: `test-results/excel-import-${info.project.name}.png`, fullPage: true });
    await page.goto(`/schedule/new?club_id=${club}`); await page.getByLabel("Tên buổi chơi", { exact: true }).fill("Buổi nguồn"); await page.getByLabel("Địa điểm", { exact: true }).fill("Sân thử"); await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 86400000))); await page.getByLabel("Phí vãng lai / người", { exact: true }).fill("80000");
    await page.getByText("Giới hạn và chính sách tham gia", { exact: true }).click(); await page.getByLabel("Chính sách hủy", { exact: true }).fill("Hủy trước 2 giờ"); await page.getByLabel("Hạn đăng ký", { exact: true }).fill(localNow(new Date(Date.now() + 3600000))); await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click(); await expect(page).toHaveURL(/\/games\/\d+$/);
    const source = Number(new URL(page.url()).pathname.split("/").at(-1));
    await pool.query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [club]);
    await page.getByRole("link", { name: "Sao chép thành buổi mới", exact: true }).click();
    await expect(page.getByLabel("Tên buổi chơi", { exact: true })).toHaveValue("Buổi nguồn"); await expect(page.getByLabel("Phí vãng lai / người", { exact: true })).toHaveValue("80000"); await expect(page.getByLabel("Giờ bắt đầu", { exact: true })).toBeEmpty();
    await expect(page.getByRole("textbox", { name: "Chính sách hủy", exact: true })).toHaveValue("Hủy trước 2 giờ"); await expect(page.getByLabel("Hạn đăng ký", { exact: true })).toBeEmpty();
    await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 2 * 86400000))); await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click(); await expect(page).toHaveURL(/\/games\/\d+$/);
    const copied = Number(new URL(page.url()).pathname.split("/").at(-1)); expect(copied).not.toBe(source);
    expect((await pool.query("SELECT 1 FROM clubhost.bookings WHERE session_id=$1", [copied])).rowCount).toBe(0);
    for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    expect(errors).toEqual([]);
  } finally {
    // No money, bookings or images created by this scenario.
    if (club) { await pool.query("DELETE FROM clubhost.audit_logs WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.game_sessions WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.members WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.clubs WHERE id=$1", [club]); }
    if (account) { await pool.query("DELETE FROM clubhost.audit_logs WHERE host_id=$1", [account]); await pool.query("DELETE FROM clubhost.hosts WHERE id=$1", [account]); }
    await pool.end();
  }
});
