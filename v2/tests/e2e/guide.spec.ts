import { test, expect } from "@playwright/test";
import { disposablePool } from "./disposable-db";

test("prioritized guides support search, deep links, club permissions and mobile navigation", async ({ page }, info) => {
  test.setTimeout(120000);
  const pool = disposablePool(), email = `guide-${info.project.name}-${Date.now()}@example.com`;
  let account: number | undefined, owner: number | undefined, club: number | undefined;
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    expect((await page.request.get("/guide")).status()).toBe(401);
    await page.goto("/signup"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Mật khẩu", { exact: true }).fill("guide-browser-password-123"); await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
    account = (await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1", [email])).rows[0].id;
    await page.getByRole("button", { name: "Khám phá sau", exact: true }).click();
    await page.getByRole("link", { name: "Tất cả hướng dẫn", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hướng dẫn từng bước", exact: true })).toBeVisible();
    const groups = page.getByRole("navigation", { name: "Nhóm hướng dẫn theo độ cần thiết" });
    await expect(groups.getByRole("link").nth(1)).toContainText("Bắt đầu tổ chức buổi chơi");
    await expect(groups).not.toContainText("Quản trị nền tảng");
    await page.getByLabel("Tìm tính năng hoặc việc cần làm").fill("nhap excel"); await page.getByRole("button", { name: "Tìm hướng dẫn", exact: true }).click();
    const excel = page.locator("#guide-excel-members"); await expect(excel).toBeVisible(); await expect(excel.getByRole("list")).toContainText("Tải file Excel mẫu"); await expect(excel).toContainText("Tạo hoặc chọn CLB");
    await excel.getByRole("link", { name: "Liên kết bài: Nhập danh sách thành viên từ Excel", exact: true }).click(); await expect(page).toHaveURL(/topic=excel-members#guide-excel-members$/); await page.reload(); await expect(excel).toHaveAttribute("open", ""); await expect(excel.getByRole("list")).toBeVisible();
    await excel.locator("summary").focus(); await page.keyboard.press("Enter"); await expect(excel).not.toHaveAttribute("open", ""); await page.keyboard.press("Enter"); await expect(excel.getByRole("list")).toBeVisible();
    await page.screenshot({ path: info.outputPath("excel-guide.png"), fullPage: false });
    await page.goto("/guide?q=zzzz-not-a-feature"); await expect(page.getByRole("heading", { name: "Chưa tìm thấy hướng dẫn phù hợp" })).toBeVisible(); await page.getByRole("link", { name: "Xem tất cả hướng dẫn", exact: true }).click();
    await page.goto("/clubs/new"); await page.getByLabel("Tên câu lạc bộ", { exact: true }).fill("Guide club"); await page.getByRole("button", { name: "Tạo câu lạc bộ", exact: true }).click(); await expect(page).toHaveURL(/\/clubs\/\d+$/); club = Number(new URL(page.url()).pathname.split("/").at(-1));
    await page.goto(`/guide?club_id=${club}&topic=excel-members`); await expect(excel.getByRole("link", { name: "Mở màn hình thao tác", exact: true })).toHaveAttribute("href", `/members?club_id=${club}`);
    await pool.query("UPDATE clubhost.clubs SET trial_ends_at=NULL,pro_ends_at=NULL WHERE id=$1", [club]);
    await page.goto(`/guide?club_id=${club}&topic=cohosts`); await expect(page.locator("#guide-cohosts")).toContainText("Cần Pro");
    // Restrict this synthetic account to check-in on this isolated fixture.
    owner = (await pool.query("INSERT INTO clubhost.hosts(email,password_hash) VALUES($1,'synthetic-unusable') RETURNING id", ["owner-" + email])).rows[0].id;
    await pool.query("UPDATE clubhost.clubs SET owner_id=$1 WHERE id=$2", [owner, club]);
    await pool.query("INSERT INTO clubhost.club_access(club_id,host_id,role,permissions) VALUES($1,$2,'manager',$3)", [club, account, JSON.stringify(["check_in"])]);
    await page.goto(`/guide?club_id=${club}&topic=receive-refund`); await expect(page.locator("#guide-receive-refund")).toContainText("cần quyền phù hợp"); await expect(page.locator("#guide-receive-refund").getByRole("link", { name: "Mở màn hình thao tác", exact: true })).toHaveCount(0);
    await page.goto(`/guide?club_id=${club}&topic=attendance`); await expect(page.locator("#guide-attendance").getByRole("link", { name: "Mở màn hình thao tác", exact: true })).toHaveAttribute("href", `/schedule?club_id=${club}`);
    expect((await page.request.get("/guide?club_id=2147483647")).status()).toBe(404);
    if (!process.env.SPORTHOST_E2E_ORIGIN) {
      await pool.query("UPDATE clubhost.hosts SET is_platform_admin=true WHERE id=$1", [account]);
      await page.goto("/guide?group=admin"); await expect(page.getByRole("heading", { name: "8. Quản trị nền tảng", exact: true })).toBeVisible();
    }
    await page.goto("/guide");
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.setViewportSize({ width: 375, height: 812 }); await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).last().getByRole("link")).toHaveCount(5);
    const receipt = (await pool.query("SELECT status FROM clubhost.host_tour_preferences WHERE account_id=$1", [account])).rows[0]; expect(receipt.status).toBe("dismissed"); expect((await pool.query("SELECT 1 FROM clubhost.host_tour_progress WHERE account_id=$1 AND completed_at IS NOT NULL", [account])).rowCount).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    if (club) { await pool.query("DELETE FROM clubhost.audit_logs WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.club_access WHERE club_id=$1", [club]); await pool.query("DELETE FROM clubhost.clubs WHERE id=$1", [club]); }
    for (const id of [account, owner]) if (id) { await pool.query("DELETE FROM clubhost.audit_logs WHERE host_id=$1", [id]); await pool.query("DELETE FROM clubhost.hosts WHERE id=$1", [id]); }
    await pool.end();
  }
});
