import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { disposablePool } from "./disposable-db";
import { randomBytes } from "node:crypto";
import { localNow } from "../../src/domain/session-policy";

const origin = "http://127.0.0.1:3100";
async function csrf(page: Page, path: string) {
  expect((await page.goto(path))?.status()).toBe(200);
  return page.locator('input[name="csrf"]').first().inputValue();
}
async function post(
  request: APIRequestContext,
  path: string,
  token: string,
  form: Record<string, string>,
) {
  const response = await request.post(path, {
    form: { ...form, csrf: token },
    headers: { Origin: origin },
    maxRedirects: 0,
  });
  expect(
    response.status(),
    `${path}: ${(await response.text()).slice(0, 100)}`,
  ).toBe(303);
  return response;
}

test("Phase 1 admin area, direct APIs, confirmations and responsive navigation", async ({
  page,
  playwright,
}, info) => {
  test.skip(
    !!process.env.SPORTHOST_E2E_ORIGIN,
    "This administration suite writes only to a disposable loopback database",
  );
  test.setTimeout(180000);
  const pool = disposablePool(),
    prefix = `admin-browser-${info.project.name}-${randomBytes(5).toString("hex")}`;
  let admin: number | undefined,
    member: number | undefined,
    club: number | undefined;
  const pageIds: number[] = [];
  try {
    const anonymous = await playwright.request.newContext({ baseURL: origin });
    try {
      expect((await anonymous.get("/api/admin/users")).status()).toBe(401);
      expect((await anonymous.get("/admin/users")).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
    await post(page.request, "/signup", await csrf(page, "/signup"), {
      email: prefix + "@example.com",
      password: "synthetic-browser-password",
    });
    admin = (
      await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1", [
        prefix + "@example.com",
      ])
    ).rows[0].id;
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/onboarding",
      "/api/admin/users",
      "/api/admin/overview",
    ]) {
      expect((await page.request.get(path)).status()).toBe(403);
    }
    const token = await csrf(page, "/account");
    const created = await post(page.request, "/clubs", token, {
      name: prefix + " club",
    });
    club = Number(created.headers().location.match(/\/clubs\/(\d+)/)![1]);
    // Test-only privilege on this disposable synthetic account; never a real bootstrap.
    await pool.query(
      "UPDATE clubhost.hosts SET is_platform_admin=true,email_verified=true WHERE id=$1 AND email=$2",
      [admin, prefix + "@example.com"],
    );
    member = (
      await pool.query(
        "INSERT INTO clubhost.hosts(email,password_hash) VALUES($1,'synthetic-unusable') RETURNING id",
        [prefix + "-member@example.com"],
      )
    ).rows[0].id;
    const game = await post(page.request, `/clubs/${club}/games`, token, {
      title: prefix + " session",
      starts_at: localNow(new Date(Date.now() + 86400000)),
      capacity: "10",
      guest_fee: "50000",
    });
    const gameId = Number(game.headers().location.match(/\/games\/(\d+)/)![1]);
    const modules = [
      "users",
      "hosts",
      "clubs",
      "sessions",
      "subscriptions",
      "audit-logs",
    ];
    expect((await page.goto("/admin"))?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Tổng quan nền tảng", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("MRR quy đổi 30 ngày", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Hiệu quả bắt đầu của host", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hiệu quả bắt đầu của host", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "7 ngày", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Host được hiển thị hướng dẫn trong 7 ngày qua", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/admin");
    await page.screenshot({ path: info.outputPath("admin-overview.png"), fullPage: true });
    for (const module of modules) {
      const result = await page.request.get(`/api/admin/${module}`);
      expect(result.status()).toBe(200);
      expect(result.headers()["cache-control"]).toContain("no-store");
      expect((await result.json()).rows.length).toBeLessThanOrEqual(25);
      expect((await page.goto(`/admin/${module}?q=${prefix}`))?.status()).toBe(
        200,
      );
    }
    for (const path of [
      `/admin/users/${member}`,
      `/admin/hosts/${admin}`,
      `/admin/clubs/${club}`,
      `/admin/sessions/${gameId}`,
      `/admin/subscriptions/${club}`,
    ])
      expect((await page.goto(path))?.status()).toBe(200);
    expect((await page.request.get("/api/admin/users?page=0")).status()).toBe(
      400,
    );
    expect(
      (await page.request.get("/api/admin/users?page=1&page=2")).status(),
    ).toBe(400);
    expect(
      (await page.request.get("/api/admin/users?status=ROOT")).status(),
    ).toBe(400);
    const headers = { Origin: origin, "x-csrf-token": token };
    const command = {
      action: "suspend",
      targetId: member,
      reason: "Reviewed synthetic browser suspension",
      version: "0",
      confirmed: true,
    };
    expect(
      (
        await page.request.post("/api/admin/commands", {
          headers: { ...headers, Origin: "https://foreign.invalid" },
          data: command,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/admin/commands", {
          headers: { Origin: origin },
          data: command,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/admin/commands", {
          headers,
          data: { ...command, action: "grant_admin" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/admin/commands", {
          headers,
          data: { ...command, targetId: admin },
        })
      ).status(),
    ).toBe(409);
    await page.goto(`/admin/users/${member}`);
    await page.getByLabel("Lý do quản trị").fill(command.reason);
    await page.getByRole("button", { name: "Xem lại và xác nhận" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT suspended FROM clubhost.account_controls WHERE account_id=$1",
          [member],
        )
      ).rows[0]?.suspended || false,
    ).toBe(false);
    await page.getByRole("button", { name: "Xem lại và xác nhận" }).click();
    await page.getByRole("button", { name: "Xác nhận lưu" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã lưu thay đổi" }),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT suspended FROM clubhost.account_controls WHERE account_id=$1",
          [member],
        )
      ).rows[0].suspended,
    ).toBe(true);
    const suspendedVersion = String(
      (
        await pool.query(
          "SELECT session_version FROM clubhost.hosts WHERE id=$1",
          [member],
        )
      ).rows[0].session_version,
    );
    expect(
      (
        await page.request.post("/api/admin/commands", {
          headers,
          data: { ...command, action: "reactivate", version: suspendedVersion },
        })
      ).status(),
    ).toBe(200);
    const audit = (
      await (
        await page.request.get(
          `/api/admin/audit-logs?actor=${admin}&status=suspend`,
        )
      ).json()
    ).rows.find((r: { target_id: number }) => r.target_id === member);
    expect(audit).toBeTruthy();
    expect((await page.goto(`/admin/audit-logs/${audit.id}`))?.status()).toBe(
      200,
    );
    await expect(page.getByText(command.reason, { exact: true })).toBeVisible();
    await page.goto(`/admin/subscriptions/${club}`);
    await page
      .getByRole("combobox", { name: "Hành động", exact: true })
      .selectOption("extend_trial");
    await page.getByLabel("Số ngày gia hạn").fill("3");
    await page
      .getByLabel("Lý do quản trị")
      .fill("Reviewed browser trial extension");
    await page.getByRole("button", { name: "Xem lại và xác nhận" }).click();
    await page.getByRole("button", { name: "Xác nhận lưu" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã lưu thay đổi" }),
    ).toBeVisible();
    pageIds.push(
      ...(
        await pool.query(
          "INSERT INTO clubhost.hosts(email,password_hash) SELECT $1||g||'@example.com','synthetic-unusable' FROM generate_series(1,27) g RETURNING id",
          [prefix + "-page-"],
        )
      ).rows.map((r) => r.id),
    );
    await page.goto("/admin/users");
    await page.getByLabel("Tìm kiếm", { exact: true }).fill(prefix + "-page-");
    await expect(page).toHaveURL(new RegExp("q=" + prefix + "-page-"));
    await expect(
      page.getByText("Trang 1 / 2 · 25 bản ghi mỗi trang", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Trang sau →" }).click();
    await expect(
      page.getByText("Trang 2 / 2 · 25 bản ghi mỗi trang", { exact: true }),
    ).toBeVisible();
    await page.goto(`/admin/users?q=${prefix}-member`);
    if (info.project.name === "mobile") {
      await page.getByText("Điều hướng quản trị", { exact: true }).click();
      await expect(
        page.getByRole("navigation", { name: "Quản trị" }).last(),
      ).toBeVisible();
    } else
      await expect(
        page.getByRole("navigation", { name: "Quản trị" }).first(),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/local/admin-phase1-${info.project.name}.png`,
      fullPage: true,
    });
    const payload = await (
      await page.request.get(`/api/admin/users/${member}`)
    ).text();
    expect(payload).not.toMatch(
      /password_hash|passwordHash|token_digest|SECRET_KEY/,
    );
    // Existing host functionality remains available in the separate workspace.
    expect((await page.goto("/dashboard"))?.status()).toBe(200);
    expect((await page.goto("/me"))?.status()).toBe(200);
  } finally {
    if (admin) {
      const ids = [admin, ...(member ? [member] : []), ...pageIds];
      await pool.query(
        "DELETE FROM clubhost.admin_audit_events WHERE actor_id=$1",
        [admin],
      );
      await pool.query(
        "DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])",
        [ids],
      );
      if (club) {
        await pool.query(
          "DELETE FROM clubhost.game_sessions WHERE club_id=$1",
          [club],
        );
        await pool.query(
          "DELETE FROM clubhost.clubs WHERE id=$1 AND owner_id=$2",
          [club, admin],
        );
      }
      await pool.query(
        "DELETE FROM clubhost.email_tokens WHERE host_id=ANY($1::int[])",
        [ids],
      );
      await pool.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [
        ids,
      ]);
    }
    await pool.end();
  }
});
