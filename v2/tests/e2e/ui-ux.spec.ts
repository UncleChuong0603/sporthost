import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { localNow } from "../../src/domain/session-policy";

const widths = [360, 390, 430, 768, 1024, 1440];

async function signup(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email", { exact: true }).fill(`ui-qa-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("synthetic-ui-qa-password");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function club(page: Page) {
  await page.goto("/clubs/new");
  await page.getByLabel("Tên câu lạc bộ", { exact: true }).fill("CLB Cầu lông cuối tuần · Quận trung tâm");
  await page.getByRole("button", { name: "Tạo câu lạc bộ", exact: true }).click();
  await expect(page).toHaveURL(/\/clubs\/\d+$/);
  return new URL(page.url()).pathname;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("public and authentication pages fit six viewports with keyboard and validation", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/login", "/me/signup", "/forgot-password"]) {
      await page.goto(path); await expect(page.locator("h1")).toHaveCount(1); await noOverflow(page);
    }
    await page.goto("/login");
    const password = page.getByLabel("Mật khẩu", { exact: true });
    await expect(password).toBeInViewport();
    await password.fill("visible-password");
    await page.getByRole("button", { name: "Hiện mật khẩu", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.screenshot({ path: info.outputPath(`auth-${width}.png`), fullPage: true });
  }
  await page.goto("/");
  await page.screenshot({ path: info.outputPath("public-home.png"), fullPage: true });
  const observation = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const scripts = performance.getEntriesByType("resource").filter(entry => (entry as PerformanceResourceTiming).initiatorType === "script") as PerformanceResourceTiming[];
    return { viewport: innerWidth, domContentLoadedMs: navigation.domContentLoadedEventEnd, responseStartMs: navigation.responseStart,
      scripts: scripts.length, scriptEncodedBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      paints: performance.getEntriesByType("paint").map(entry => ({ name: entry.name, ms: entry.startTime })) };
  });
  await info.attach("local-navigation-observation", { body: JSON.stringify(observation), contentType: "application/json" });
  await page.goto("/"); await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Đến nội dung chính", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeInViewport();
  await page.goto("/login"); await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  const contrast = await page.getByLabel("Email", { exact: true }).evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const border = luminance(style.borderTopColor), background = luminance(style.backgroundColor);
    return (Math.max(border, background) + .05) / (Math.min(border, background) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.getByRole("button", { name: "Đăng nhập", exact: true }).evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(.001);
  expect(errors).toEqual([]);
});

test("host navigation, retained errors, upload preflight and confirmation are usable", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await signup(page); const clubPath = await club(page);
  await page.goto("/members?club_id=" + clubPath.split("/").at(-1));
  await page.getByLabel("Họ tên", { exact: true }).fill("Giữ nội dung sau lỗi");
  await page.getByLabel("Số điện thoại", { exact: true }).fill("invalid-phone");
  await page.getByRole("button", { name: "Thêm thành viên", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Họ tên", { exact: true })).toHaveValue("Giữ nội dung sau lỗi");
  await expect(page.getByLabel("Số điện thoại", { exact: true })).toHaveValue("invalid-phone");
  await page.getByLabel("Số điện thoại", { exact: true }).fill("0901234999");
  await page.getByRole("button", { name: "Thêm thành viên", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã thêm thành viên");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/dashboard", "/clubs", "/schedule", "/members", "/finance", clubPath]) {
      await page.goto(path); await noOverflow(page);
      await expect(page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).locator('[aria-current="page"]')).toHaveCount(1);
    }
    await page.screenshot({ path: info.outputPath(`club-${width}.png`), fullPage: true });
  }
  const qr = page.getByLabel("Ảnh QR mới (tùy chọn)", { exact: true });
  await qr.setInputFiles({ name: "unsupported.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chọn ảnh PNG");
  await qr.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("không quá 2 MB");
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: "teal" } }).png().toBuffer();
  await qr.setInputFiles({ name: "qr.png", mimeType: "image/png", buffer });
  await expect(page.getByRole("img", { name: "Xem trước ảnh đã chọn" })).toBeVisible();
  await page.getByLabel("Ngân hàng", { exact: true }).fill("Ngân hàng thử nghiệm");
  const uploadGate = { release: () => {} }; let submissions = 0;
  const delayedUpload = new Promise<void>(resolve => { uploadGate.release = resolve; });
  await page.route("**/payment-settings", async route => { submissions++; await delayedUpload; await route.fulfill({ status: 503, contentType: "text/html", body: "unavailable" }); });
  await page.getByRole("button", { name: "Lưu tài khoản nhận tiền", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đang tải ảnh…", exact: true })).toBeDisabled();
  await qr.evaluate(element => (element as HTMLInputElement).form!.requestSubmit());
  uploadGate.release();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chưa lưu được ảnh");
  expect(submissions).toBe(1);
  await expect(page.getByLabel("Ngân hàng", { exact: true })).toHaveValue("Ngân hàng thử nghiệm");
  await expect(page.getByRole("img", { name: "Xem trước ảnh đã chọn" })).toBeVisible();
  await page.unroute("**/payment-settings");
  await page.route("**/payment-settings", route => route.fulfill({ status: 200, contentType: "text/html", body: "unexpected sign-in page" }));
  await page.getByRole("button", { name: "Lưu tài khoản nhận tiền", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chưa xác nhận được kết quả tải ảnh");
  await expect(page.getByRole("img", { name: "Xem trước ảnh đã chọn" })).toBeVisible();
  await page.unroute("**/payment-settings");
  await page.getByRole("button", { name: "Lưu tài khoản nhận tiền", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");
  await expect(page.getByRole("img", { name: "Mã QR nhận tiền hiện tại của CLB", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Xem trước ảnh đã chọn" })).toHaveCount(0);
  await page.goto("/schedule/new");
  await page.getByLabel("Tên buổi chơi", { exact: true }).fill("Buổi kiểm tra giao diện");
  await page.getByLabel("Giờ bắt đầu", { exact: true }).fill(localNow(new Date(Date.now() + 7 * 86400000)));
  await page.getByRole("button", { name: "Tạo buổi chơi", exact: true }).click();
  await expect(page).toHaveURL(/\/games\/\d+$/);
  await expect(page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Lịch chơi", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByText("Thêm thành viên / người đến sân", { exact: true }).click();
  await page.getByRole("button", { name: "Nhận thành viên", exact: true }).click();
  await expect(page.getByText("1/20 chỗ", { exact: true })).toBeVisible();
  await page.getByText(/^Thu trước khi phát hành ·/).click();
  await page.getByRole("button", { name: "Host xác nhận đã thu trước", exact: true }).click();
  const undo = page.getByRole("button", { name: "Hoàn tác ghi nhận đã thu", exact: true });
  await expect(undo).toBeVisible(); await undo.click();
  await expect(page.getByRole("dialog")).toContainText("Chỉ hoàn tác khi CLB đã ghi nhận nhầm");
  await page.getByRole("dialog").getByRole("button", { name: "Quay lại", exact: true }).click();
  await expect(undo).toBeVisible(); await undo.click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("button", { name: "Host xác nhận đã thu trước", exact: true })).toBeVisible();
  const cancellation = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Hủy buổi chơi$/ }) });
  await cancellation.locator("summary").click();
  await cancellation.getByRole("button", { name: "Xác nhận hủy buổi chơi", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath("confirmation.png") });
  await expect(dialog.getByRole("button", { name: "Quay lại", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Xác nhận", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Quay lại", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  await expect(cancellation.getByRole("button", { name: "Xác nhận hủy buổi chơi", exact: true })).toBeFocused();
  await expect(page.getByText("Mở đăng ký", { exact: true })).toBeVisible();
  await cancellation.getByRole("button", { name: "Xác nhận hủy buổi chơi", exact: true }).click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.locator("p").filter({ hasText: /^Đã hủy$/ })).toBeVisible();
  expect(errors).toEqual([]);
});
