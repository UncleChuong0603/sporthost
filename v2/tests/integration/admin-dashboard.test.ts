import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { installTestEnv } from "./environment";
import { closePool, getPool, transaction } from "@/server/db/client";
import * as database from "@/server/db/client";
import { signup, login, findCurrentHost } from "@/server/auth/service";
import { makeSession } from "@/server/auth/session";
import { issueEmailToken, consumeEmailToken } from "@/server/auth/email-tokens";
import { createClub } from "@/server/modules/clubs/service";
import { createSession } from "@/server/modules/scheduling/service";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { requireClubAccess } from "@/server/access/permissions";
import { getDb } from "@/server/db/client";
import { pageAccess } from "@/server/compatibility/page-access";
import {
  adminCommand,
  adminDetail,
  adminList,
  adminOverview,
  assertAdmin,
} from "@/server/modules/admin/service";
import { runAdminCommand } from "@/server/modules/admin/mutations";
import { localNow } from "@/domain/session-policy";

const prefix = "admin-phase1-" + randomBytes(6).toString("hex");
const accounts: number[] = [],
  clubs: { id: number; owner: number; name: string }[] = [];
let admin: number,
  second: number,
  host: number,
  member: number,
  club: number,
  session: number;
const password = "synthetic-admin-test-password";
const reason = "Reviewed isolated admin integration fixture";
const command = (
  action: string,
  targetId: number,
  version: string,
  days?: number,
) => ({ action, targetId, version, reason, confirmed: true, days });
async function version(id = club) {
  const row = (
    await getPool().query(
      "SELECT trial_ends_at,pro_ends_at FROM clubhost.clubs WHERE id=$1",
      [id],
    )
  ).rows[0];
  return `${row.trial_ends_at || ""}|${row.pro_ends_at || ""}`;
}
async function accountVersion(id: number) {
  return String(
    (
      await getPool().query(
        "SELECT session_version FROM clubhost.hosts WHERE id=$1",
        [id],
      )
    ).rows[0].session_version,
  );
}
async function newClub(owner: number, suffix: string) {
  const name = prefix + suffix;
  const c = await createClub(owner, { name });
  clubs.push({ id: c.id, owner, name });
  return c.id;
}

beforeAll(async () => {
  installTestEnv();
  for (const role of ["admin", "second", "host", "member"])
    accounts.push((await signup(`${prefix}-${role}@example.com`, password)).id);
  [admin, second, host, member] = accounts;
  await getPool().query(
    "UPDATE clubhost.hosts SET is_platform_admin=true,email_verified=true WHERE id=ANY($1::int[])",
    [[admin, second]],
  );
  club = await newClub(host, "club");
  session = (
    await createSession(host, club, {
      title: prefix + "session",
      starts_at: localNow(new Date(Date.now() + 86400000)),
      capacity: 10,
      guest_fee: 50000,
    })
  ).gameId!;
});
afterAll(async () => {
  if (!accounts.length) return;
  await getPool().query(
    "UPDATE clubhost.account_controls SET suspended=false WHERE account_id=ANY($1::int[])",
    [accounts],
  );
  await getPool().query(
    "DELETE FROM clubhost.platform_ledger_entries WHERE created_by=ANY($1::int[])",
    [accounts],
  );
  await getPool().query(
    "DELETE FROM clubhost.payment_orders WHERE host_id=ANY($1::int[])",
    [accounts],
  );
  for (const c of clubs) {
    if (
      (
        await getPool().query("SELECT 1 FROM clubhost.clubs WHERE id=$1", [
          c.id,
        ])
      ).rowCount
    )
      await deleteClub(c.owner, c.id, c.name);
  }
  await transaction(async (db) => {
    await db.query(
      "DELETE FROM clubhost.admin_audit_events WHERE actor_id=ANY($1::int[])",
      [accounts],
    );
    await db.query(
      "DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])",
      [accounts],
    );
    await db.query(
      "DELETE FROM clubhost.email_tokens WHERE host_id=ANY($1::int[])",
      [accounts],
    );
    await db.query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [
      accounts,
    ]);
  });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await closePool();
});

describe("Phase 1 admin authorization and schema compatibility", () => {
  it("denies anonymous, member and host page requests and direct data/service access", async () => {
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/subscriptions",
      "/admin/audit-logs",
    ]) {
      await expect(
        pageAccess(new URL(path, "http://127.0.0.1:3000"), ""),
      ).rejects.toMatchObject({ status: 401 });
      for (const id of [member, host])
        await expect(
          pageAccess(
            new URL(path, "http://127.0.0.1:3000"),
            makeSession({ id, session_version: 0 }),
          ),
        ).rejects.toMatchObject({ status: 403 });
      await expect(
        pageAccess(
          new URL(path, "http://127.0.0.1:3000"),
          makeSession({ id: admin, session_version: 0 }),
        ),
      ).resolves.toBeUndefined();
    }
    for (const id of [member, host]) {
      await expect(adminOverview(id)).rejects.toMatchObject({ status: 403 });
      await expect(adminList(id, "users")).rejects.toMatchObject({
        status: 403,
      });
      await expect(adminDetail(id, "users", admin)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        adminCommand(id, command("suspend", admin, "0")),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      adminCommand(admin, {
        ...command("suspend", member, "0"),
        isPlatformAdmin: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      adminCommand(admin, { ...command("grant_admin", member, "0") }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("does not grant administrative access through public verification, even with ADMIN_EMAILS", async () => {
    vi.stubEnv("ADMIN_EMAILS", `${prefix}-member@example.com`);
    const token = await issueEmailToken(member, "verify");
    await consumeEmailToken(token, "verify");
    expect(
      (await findCurrentHost(makeSession({ id: member, session_version: 0 })))
        ?.isPlatformAdmin,
    ).toBe(false);
  });
  it("replays the additive migration without changing legacy business columns or existing timestamps", async () => {
    const before = (
      await getPool().query(
        "SELECT entity_type,entity_id,created_at FROM clubhost.entity_registry WHERE entity_id=ANY($1::int[]) ORDER BY entity_type,entity_id",
        [[...accounts, club, session]],
      )
    ).rows;
    const ddl = readFileSync("migrations/0003_admin_dashboard.sql", "utf8");
    await getPool().query(ddl);
    await getPool().query(ddl);
    expect(
      (
        await getPool().query(
          "SELECT entity_type,entity_id,created_at FROM clubhost.entity_registry WHERE entity_id=ANY($1::int[]) ORDER BY entity_type,entity_id",
          [[...accounts, club, session]],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await getPool().query(
          "SELECT clubhost.admin_instant('not-a-date') AS invalid,clubhost.admin_instant('2041-02-01T07:00:00+07:00')=clubhost.admin_instant('2041-02-01T00:00:00Z') AS same",
        )
      ).rows[0],
    ).toEqual({ invalid: null, same: true });
    expect(
      before.some((r) => r.entity_type === "host" && r.entity_id === host),
    ).toBe(true);
  });
});
describe("admin lists, inspection and validation", () => {
  it("filters roles/status, searches safely, paginates on the server and exposes no auth secrets", async () => {
    await getPool().query(
      "INSERT INTO clubhost.hosts(email,password_hash) SELECT $1||g||'@example.com','synthetic' FROM generate_series(1,27) g",
      [prefix + "page-"],
    );
    const pageIds = (
      await getPool().query(
        "SELECT id FROM clubhost.hosts WHERE email LIKE $1",
        [prefix + "page-%"],
      )
    ).rows.map((r) => r.id);
    accounts.push(...pageIds);
    const first = await adminList(admin, "users", {
        q: prefix + "page-",
        page: 1,
        role: "MEMBER",
      }),
      last = await adminList(admin, "users", { q: prefix + "page-", page: 2 });
    expect(first).toMatchObject({ total: 27, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(25);
    expect(last.rows).toHaveLength(2);
    expect(new Set([...first.rows, ...last.rows].map((r) => r.id)).size).toBe(
      27,
    );
    expect(JSON.stringify(first)).not.toMatch(
      /password_hash|passwordHash|token_digest|SECRET_KEY/,
    );
    expect(
      (await adminList(admin, "hosts", { q: prefix })).rows.some(
        (r) => r.id === host,
      ),
    ).toBe(true);
    expect(
      (await adminList(admin, "users", { q: prefix, role: "ADMIN" })).rows
        .map((r) => r.id)
        .sort(),
    ).toEqual([admin, second].sort());
    expect(
      (await adminList(admin, "users", { q: "%' OR true --" })).total,
    ).toBe(0);
    expect(
      (await adminList(admin, "users", { q: prefix, status: "SUSPENDED" }))
        .total,
    ).toBe(0);
    expect(
      (await adminList(admin, "users", { q: prefix + "page-", page: 999 }))
        .page,
    ).toBe(2);
  });
  it("inspects clubs, sessions, subscription periods and bounded empty states", async () => {
    expect(
      (await adminList(admin, "clubs", { q: prefix })).rows.find(
        (r) => r.id === club,
      ),
    ).toMatchObject({ members: 0, sessions: 1, status: "TRIAL" });
    expect(
      (await adminList(admin, "sessions", { q: prefix, status: "OPEN" }))
        .rows[0],
    ).toMatchObject({ id: session, participants: 0, status: "OPEN" });
    expect((await adminDetail(admin, "users", host)).related).toContainEqual(
      expect.objectContaining({ id: club, relationship: "OWNER" }),
    );
    expect((await adminDetail(admin, "subscriptions", club)).row).toMatchObject(
      { status: "TRIAL", payment_verification: null },
    );
    expect(
      (
        await adminList(admin, "sessions", {
          q: prefix,
          from: "2040-01-01",
          to: "2040-01-02",
        })
      ).rows,
    ).toEqual([]);
    expect((await adminList(admin, "audit-logs", { q: prefix })).rows).toEqual(
      [],
    );
    for (const bad of [
      { page: 0 },
      { q: "x".repeat(161) },
      { from: "2026-02-30" },
      { from: "2041-01-02", to: "2041-01-01" },
      { status: "unsupported" },
      { role: "ROOT" },
      { unexpected: true },
    ])
      await expect(adminList(admin, "users", bad)).rejects.toMatchObject({
        status: 400,
      });
    await expect(adminDetail(admin, "clubs", -1)).rejects.toMatchObject({
      status: 400,
    });
  });
});
describe("account controls and transactional administration", () => {
  it("suspends/reactivates an account, revokes cookies and enforces host business access", async () => {
    const raw = makeSession({ id: host, session_version: 0 });
    await adminCommand(admin, command("suspend", host, "0"));
    expect(await findCurrentHost(raw)).toBeNull();
    await expect(
      login(`${prefix}-host@example.com`, password),
    ).rejects.toMatchObject({ code: "account_suspended" });
    await expect(requireClubAccess(getDb(), host, club)).rejects.toMatchObject({
      status: 403,
    });
    await expect(createClub(host, { name: "suspended" })).rejects.toMatchObject(
      { status: 403 },
    );
    expect(
      (
        await adminList(admin, "users", { q: prefix, status: "SUSPENDED" })
      ).rows.map((r) => r.id),
    ).toContain(host);
    await expect(
      adminCommand(admin, command("suspend", host, "0")),
    ).rejects.toMatchObject({ status: 409 });
    await adminCommand(
      admin,
      command("reactivate", host, await accountVersion(host)),
    );
    expect(await findCurrentHost(raw)).toBeNull();
    expect((await login(`${prefix}-host@example.com`, password)).id).toBe(host);
    const audit = await adminList(admin, "audit-logs", {
      actor: admin,
      status: "suspend",
    });
    const item = audit.rows.find((r) => r.target_id === host)!;
    expect(item).toBeDefined();
    expect(
      (await adminDetail(admin, "audit-logs", item.id)).related[0],
    ).toMatchObject({
      changes: { before: { suspended: false }, after: { suspended: true } },
    });
  });
  it("blocks self suspension, requires a reason/confirmation and rolls back on an audit failure", async () => {
    await expect(
      adminCommand(admin, command("suspend", admin, "0")),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      adminCommand(admin, {
        ...command("suspend", member, "0"),
        confirmed: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      adminCommand(admin, { ...command("suspend", member, "0"), reason: "" }),
    ).rejects.toMatchObject({ status: 400 });
    const original = database.transaction;
    const failure = vi
      .spyOn(database, "transaction")
      .mockImplementationOnce((run) =>
        original(async (db) => {
          const query = db.query.bind(db);
          const queryFailure = vi
            .spyOn(db, "query")
            .mockImplementation((...args: unknown[]) => {
              if (
                String(args[0]).startsWith(
                  "INSERT INTO clubhost.admin_audit_events",
                )
              )
                return Promise.reject(Error("Synthetic audit failure"));
              return (query as (...args: unknown[]) => Promise<unknown>)(
                ...args,
              );
            });
          try {
            return await run(db);
          } finally {
            queryFailure.mockRestore();
          }
        }),
      );
    try {
      await expect(
        adminCommand(admin, command("suspend", member, "0")),
      ).rejects.toThrow("Synthetic audit failure");
    } finally {
      failure.mockRestore();
    }
    expect((await adminDetail(admin, "users", member)).row).toMatchObject({
      status: "ACTIVE",
      version: 0,
    });
  });
});
describe("subscription policy, historical preservation and trustworthy analytics", () => {
  it("extends the existing trial endpoint without shortening it and preserves data on expiry", async () => {
    const original = await version();
    const before = Date.parse(original.split("|")[0]);
    await adminCommand(admin, command("extend_trial", club, original, 5));
    expect(Date.parse((await version()).split("|")[0])).toBe(
      before + 5 * 86400000,
    );
    await expect(
      adminCommand(admin, command("extend_trial", club, original, 5)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      adminCommand(admin, command("extend_trial", club, await version(), 0)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      adminCommand(admin, command("extend_pro", club, await version(), 30)),
    ).rejects.toMatchObject({ status: 409 });
    await adminCommand(admin, command("expire", club, await version()));
    expect((await adminDetail(admin, "subscriptions", club)).row.status).toBe(
      "EXPIRED",
    );
    expect(
      (
        await getPool().query(
          "SELECT id FROM clubhost.game_sessions WHERE id=$1",
          [session],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (await adminDetail(admin, "subscriptions", club)).history.map(
        (h) => h.action,
      ),
    ).toContain("extend_trial");
    await expect(
      adminCommand(admin, command("expire", club, await version())),
    ).rejects.toMatchObject({ status: 409 });
    await adminCommand(
      admin,
      command("extend_trial", club, await version(), 2),
    );
  });
  it("uses genuine aggregates, counts a single recurring period per CLB, and excludes unsupported revenue", async () => {
    const before = await adminOverview(admin, {
      from: "2041-01-01",
      to: "2041-01-03",
    });
    const paidClub = await newClub(host, "paid");
    const end = "2099-01-01T00:00:00.000Z";
    await getPool().query(
      "UPDATE clubhost.clubs SET pro_ends_at=$2 WHERE id=$1",
      [paidClub, end],
    );
    const code = 70000000000000 + paidClub * 10;
    for (let n = 0; n < 2; n++)
      await getPool().query(
        `INSERT INTO clubhost.payment_orders(order_code,club_id,host_id,club_name,amount,original_amount,period_days,status,expires_at,paid_at,activated_until) VALUES($1,$2,$3,$4,100000,100000,30,'PAID',now(),'2041-01-02T12:00:00+07:00',$5)`,
        [
          code + n,
          paidClub,
          host,
          prefix,
          n === 1 ? end : "2098-12-01T00:00:00.000Z",
        ],
      );
    const unverified = await newClub(host, "unverified");
    await getPool().query(
      "UPDATE clubhost.clubs SET pro_ends_at=$2 WHERE id=$1",
      [unverified, end],
    );
    await getPool().query(
      "UPDATE clubhost.entity_registry SET created_at='2041-01-02T12:00:00+07:00' WHERE entity_type='user' AND entity_id=$1",
      [member],
    );
    const data = await adminOverview(admin, {
      from: "2041-01-01",
      to: "2041-01-03",
    });
    expect(Number(data.metrics.mrr) - Number(before.metrics.mrr)).toBe(100000);
    expect(
      Number(data.metrics.collected) - Number(before.metrics.collected),
    ).toBe(200000);
    expect(data.distribution.reduce((sum, r) => sum + r.total, 0)).toBe(
      data.metrics.clubs,
    );
    expect(data.growth).toHaveLength(3);
    expect(data.growth.find((p) => p.day === "2041-01-02")?.users).toBe(1);
    expect(data.growth[0].users).toBe(0);
    await adminCommand(
      admin,
      command("extend_pro", paidClub, await version(paidClub), 3),
    );
    const after = await adminOverview(admin, {
      from: "2041-01-01",
      to: "2041-01-03",
    });
    expect(Number(after.metrics.collected)).toBe(
      Number(data.metrics.collected),
    );
    expect(Number(after.metrics.mrr)).toBe(Number(before.metrics.mrr));
    expect(
      (await adminDetail(admin, "subscriptions", paidClub)).history[0].changes
        .after.pro_ends_at,
    ).toBe("2099-01-04T00:00:00.000Z");
    await expect(
      runAdminCommand(host, {
        ...command("verify_payment", paidClub, await version(paidClub)),
        orderCode: code,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
describe("offline administrative access and concurrent administrators", () => {
  it("audits operator grants/revokes for a trusted verified account and invalidates its sessions", async () => {
    const cli = (action: string) =>
      spawnSync(
        process.execPath,
        [
          "scripts/admin-access.mjs",
          "--account-id",
          String(member),
          "--confirm-account-id",
          String(member),
          "--actor-id",
          String(admin),
          "--action",
          action,
          "--reason",
          reason,
          "--environment",
          "test",
        ],
        { encoding: "utf8", env: process.env, timeout: 12000 },
      );
    const grant = cli("grant");
    expect(grant.status, grant.stderr).toBe(0);
    await expect(assertAdmin(member)).resolves.toBeUndefined();
    expect(
      await findCurrentHost(makeSession({ id: member, session_version: 0 })),
    ).toBeNull();
    const revoke = cli("revoke");
    expect(revoke.status, revoke.stderr).toBe(0);
    await expect(assertAdmin(member)).rejects.toMatchObject({ status: 403 });
    const history = (await adminDetail(admin, "users", member)).history;
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining(["grant_admin", "revoke_admin"]),
    );
  });
  it("serializes crossing suspensions and keeps an active administrator", async () => {
    const results = await Promise.allSettled([
      adminCommand(
        admin,
        command("suspend", second, await accountVersion(second)),
      ),
      adminCommand(
        second,
        command("suspend", admin, await accountVersion(admin)),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const active = (
      await getPool().query(
        "SELECT h.id FROM clubhost.hosts h WHERE h.id=ANY($1::int[]) AND NOT EXISTS(SELECT 1 FROM clubhost.account_controls a WHERE a.account_id=h.id AND a.suspended)",
        [[admin, second]],
      )
    ).rows;
    expect(active).toHaveLength(1);
    const suspended = active[0].id === admin ? second : admin;
    await expect(assertAdmin(suspended)).rejects.toMatchObject({ status: 403 });
    await adminCommand(
      active[0].id,
      command("reactivate", suspended, await accountVersion(suspended)),
    );
  });
});
