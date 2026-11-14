# Super Admin Dashboard — Phase 1

## Scope and verified architecture

SportHost runs a single application under `v2/`: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Lucide, Drizzle ORM and the existing `pg` connection pool. PostgreSQL schema remains `clubhost`, with legacy revision `0011_fixed_member_fees`. There is no new backend, external analytics service, or paid dependency.

All login accounts, including members, use the legacy `hosts` table. `member_account_links` binds verified accounts to club member profiles. Ownership and `club_access` represent Host/cohost permissions. There is no account-wide profile name or historical registration timestamp in the legacy model. User names shown by admin come from linked member profiles; missing names/dates stay “Chưa ghi nhận”.

Subscriptions are **per CLB**, not per Host. Existing payOS orders, signed webhooks, activation transactions and platform ledger are retained. The product sells prepaid periods without automatic recurring collection. Expiration falls back to the existing free features; it does not delete records or revoke previously granted cohost access. Pro remains required for creating recurring schedules and granting new cohost access.

## Routes and boundaries

| Route | Behavior |
|---|---|
| `/admin` | Live KPIs, three growth charts, subscription distribution and recent activity |
| `/admin/users` | Name/email search, role/status/date filters, registration sorting, 25-row server pagination |
| `/admin/users/:id` | Account, club relationships, participation counts, recorded activity and suspension controls |
| `/admin/hosts`, `/admin/hosts/:id` | Host identity, managed clubs, sessions in owned clubs, subscription and recorded activity |
| `/admin/clubs`, `/admin/clubs/:id` | Read-only club inspection, member/session totals, links to sessions and subscription |
| `/admin/sessions`, `/admin/sessions/:id` | Existing lifecycle states, schedule filters, participant/attendance counts and payment summaries |
| `/admin/subscriptions`, `/admin/subscriptions/:clubId` | Trial/Pro periods, provider order history and confirmed administrative changes |
| `/admin/audit-logs`, `/admin/audit-logs/:id` | Date/action/actor filters, pagination and structured before/after changes |
| `/admin/platform-ledger` | Preserved independent platform bookkeeping, moved into the admin shell |
| `GET /api/admin/overview` | Same authorized overview data |
| `GET /api/admin/:module[/:id]` | Same authorized lists/details; module is allowlisted |
| `POST /api/admin/commands` | Strict validated mutation dispatcher; no role-management endpoint |

The independent `/admin` layout replaces the previous admin pages nested inside the Host workspace. Host and Member layouts and existing URLs remain separate. The existing native `/admin/clubs/:id/trial` adapter remains available but now requires `confirmed=yes` and an administrative `reason`.

## Authorization and security

- Reuse signed self-hosted cookies, session expiration and `session_version`. Production already requires HTTPS and Secure/HttpOnly/SameSite cookies.
- `is_platform_admin=true` is the sole administrative role. Public signup and email verification never set it. **Legacy `ADMIN_EMAILS` no longer grants access.** Existing stored administrators retain their roles.
- Every admin data method and mutation checks the persisted role and suspension state server-side. Layout, HTTP page guard, API routes and server actions independently enforce their boundaries. Direct service calls cannot bypass administrative checks.
- Suspension increments `session_version` and prevents login/current-session resolution. Reactivation increments it again, so old cookies do not become valid. Host club access, club creation and linked-member mutation boundaries also reject suspended accounts.
- Account suspension does not cancel registrations, remove members, delete clubs, or impersonate/revoke independent anonymous guest capabilities. Public guest links remain a separate existing authorization mechanism; suspension is of the login account.
- Mutations require same-origin checks, signed CSRF, a valid administrator, a reason of 5–500 characters and explicit confirmation. Shared database rate limits bound admin mutation attempts. Read responses use `private, no-store`; admin pages are not indexed.
- Parameterized SQL, allowlisted module/status/sort choices, bounded input lengths, date validation and pagination limits prevent query injection and unbounded list responses. JSON mutation bodies are streamed with an 8 KiB limit.
- A transaction-scoped advisory lock serializes account/subscription administration and operator role changes. Target rows are locked, account and subscription versions are compared, and changes plus their audit events commit together. Self-suspension and removing the last active Super Admin are rejected. Cross-suspension cannot disable both administrators.
- Password hashes, bank details, access keys, checkout URLs and provider credentials are excluded from admin projections. Client errors use the existing safe error conversion.

## Database migration

Apply `v2/migrations/0003_admin_dashboard.sql` explicitly after `0001` and `0002`, **before releasing the new application**. Startup never migrates. Readiness now requires the added columns. Other changes already present in the workspace may have their own migrations; review those independently.

The current shared checkout also contains the independent club-connection work and `0004_club_connections.sql`; its readiness check requires those tables too. Deploying an image built from this entire checkout therefore also requires checking that migration's deployment status and obtaining its own approval if it has not been applied. `0004` is outside this admin implementation; do not assume applying only `0003` satisfies readiness for the combined image.

| Addition | Purpose |
|---|---|
| `account_controls(account_id,suspended)` | Add suspension without changing the legacy account mapping |
| `entity_registry(entity_type,entity_id,created_at)` | Capture reliable creation dates going forward for users, clubs, sessions and first Host acquisition |
| `admin_audit_events` | Administrative actor/action/target/time/reason and structured changes |
| Creation/deletion triggers | Maintain metadata transactionally for normal application inserts/deletions |
| First-Host triggers | Record the first ownership/cohost acquisition; do not reclassify known historical Hosts as newly registered |
| `admin_instant(text)` | Safely parse legacy timestamp strings/offsets, returning NULL for invalid data |
| Date/action/actor/target/activity/schedule and verified-payment indexes | Support list, growth, MRR and collected-revenue queries |

No legacy business columns, tables or records are dropped, reset, truncated or backfilled. Historical dates are not fabricated. The migration is repeatable and has bounded lock/statement timeouts; index creation may still require a planned maintenance window on a large production database. Validate timing on a staging clone. A timeout rolls back the transaction; do not work around it by dropping data.

The runtime role needs SELECT/INSERT/UPDATE on `account_controls`; SELECT/INSERT/DELETE on `entity_registry` because creation/deletion triggers run as the invoking role; SELECT/INSERT and sequence usage for `admin_audit_events`; and EXECUTE on the new functions. Preserve existing business-table grants. Use a separate migration owner where possible. Audit events have no update/delete application interfaces. Revoke UPDATE/DELETE on that table from the runtime role when granting production privileges; privileged operator SQL is outside the append-only application contract.

## KPI definitions and data limitations

Totals and subscription distribution are current snapshots. The selected 7/30/90-day or custom range affects growth, activity and collected revenue. The “created in 30 days” KPI always uses a rolling 30-day window. Custom overview ranges are capped at 366 days. Date-only filters and chart grouping use Vietnam time (UTC+7), matching Bangkok's offset.

| Metric | Defensible definition |
|---|---|
| Registered users | Current rows in `hosts`; anonymous club profiles are excluded |
| Hosts | Distinct current accounts owning a club or present in `club_access` |
| Active Hosts | Current, unsuspended Hosts with recorded club operations during the selected range; provider activation and member-registration events are excluded. This is not login/last-seen telemetry |
| Clubs / sessions | Current rows in their respective business tables |
| Sessions created in 30 days | Current sessions whose captured creation metadata is within the last 30 days. Unknown legacy creation dates are excluded and counted in the visible limitation notice |
| Active verified paid subscriptions | Current Pro clubs whose expiry matches a PAID payOS order with a non-null verification time |
| Trial subscriptions | No active Pro period, but trial end is in the future |
| Expired subscriptions | A parseable trial/Pro period exists but neither is in the future. No valid historical period means FREE |
| MRR normalized to 30 days | Sum of `verified_order.amount * 30 / verified_order.period_days`, choosing at most one verified order matching each active club's Pro endpoint. Renewals and overlapping periods are not summed as separate recurring subscriptions |
| Collected revenue | Sum of unique PAID payOS orders with `paid_at` in the selected range, including payments for subsequently deleted clubs. It is separate from MRR and from manually entered platform bookkeeping |

MRR is a normalized **run rate**, not a promise of automatic renewal or a cash-receipts total. An active Pro club with no matching verified billing record is excluded rather than estimated from the list price. Administrative support extensions change entitlements without claiming revenue or rewriting payment records; a period no longer matching verified billing is excluded from MRR. Payment screenshots never count as verified funds.

Growth charts count captured creation events for records still retained. Host growth tracks first captured management acquisition, not all account signups or later club additions. Missing historical dates stay unknown; migration time is not used as a registration date. Last activity means the latest logged business operation, not a reliably tracked login. Sessions have no creator field: “Host sessions” means sessions in clubs owned by that Host, not proof of which cohost clicked Create. Club “status” is its existing entitlement status; the schema has no independent club-disabled flag.

Session inspection uses the existing DRAFT/OPEN/IN_PROGRESS/PLAY_FINISHED/SETTLED/CANCELLED lifecycle. Confirmed participant counts include a single legacy booking when no participant rows exist. Attendance and registration/payment-state summaries are aggregate-only. Marked-paid booking fees are labelled separately from signed ledger movements; neither is treated as platform subscription revenue.

## Subscription policy and transitions

Default behavior is preserved:

| Environment setting | Default |
|---|---|
| `SUBSCRIPTION_TRIAL_DAYS` | `7` |
| `SUBSCRIPTION_PERIOD_DAYS` | `30` |
| `SUBSCRIPTION_PRICE_VND` | `49000` |
| `SUBSCRIPTION_ORIGINAL_PRICE_VND` | `99000` |

The server reads one validated policy for new clubs, checkout snapshots and the subscription UI. To deliberately adopt the proposed policy, an operator can configure trial `30`, price `100000`, original price `100000`, and period `30`. This is an explicit product/deployment decision; it has not been applied. Existing trial endpoints and existing provider-order prices/periods are not rewritten. Original price must be at least the purchase price.

| Admin action | Validation and result |
|---|---|
| Extend trial | 1–365 days from max(now, existing trial end), without shortening; reject when Pro is currently active |
| Verify payment / activate | Select an existing order belonging to the club; re-fetch through the server payOS API; validate order/link/amount and full payment; apply existing activation/ledger logic atomically and audit the administrative activation |
| Extend Pro | 1–365 support days; require an existing Pro endpoint and a previously verified PAID provider order; extend from the latest applicable endpoint; record as support, not collected revenue |
| Expire | Require an active entitlement; expire both endpoints with audited before/after values; preserve all club, member, session and payment records |

There is no manual “mark screenshot as PAID” override, unrestricted session editor, account password viewer, public role-change endpoint, or speculative subscription restriction. Pending/rejected provider verification does not grant Pro. Repeated verification of an already PAID order does not add another period or ledger entry. Provider I/O runs before database locks.

## Initial Super Admin and later role changes

No administrator is automatically bootstrapped or granted production privileges by this implementation. First obtain explicit owner approval, identify an **existing trusted account**, verify its email through the normal flow, and verify the account ID in the correct database. Keep database/session/provider secrets in private operator configuration; never paste them in this document or shell arguments.

Run from `v2/` in a trusted checkout with Node and dependencies installed. The tool reads `.env.local` when available plus process environment. `--environment` must match `APP_ENV`; production connections require verified TLS. The following is a template with an intentionally invalid placeholder, not an account to create:

```sh
node scripts/admin-access.mjs --account-id TRUSTED_ID --confirm-account-id TRUSTED_ID --action grant --reason "Owner-approved initial administrator" --environment production
```

Bootstrap is permitted only when there are no active Super Admins. If there are already administrators, an existing active administrator ID is required as `--actor-id EXISTING_ADMIN_ID`. Revocation uses `--action revoke` with an actor. Self-revocation and last-admin removal are rejected. Every successful change is transactional, audited, and increments the target's session version; sign in again afterward. The tool does not create accounts, verify email, bypass suspension, or expose a network endpoint.

## Verification and deployment

Only disposable loopback PostgreSQL databases ending in `_test` are used by automated integration/browser fixtures. No production database or actual provider payment is required for those tests. payOS and SMTP use existing local mocks/sinks.

```sh
cd v2
npm run db:test:prepare
npm run typecheck
node node_modules/vitest/vitest.mjs run --no-file-parallelism --hookTimeout=30000
npm run build
npm run test:e2e
```

The test hook timeout gives Windows' local OpenSSL certificate generator sufficient startup time. No lint script is configured in this repository; use TypeScript checks and `git diff --check` for the available static checks. Admin integration tests cover server authorization, the public-verification privilege boundary, migration repeatability, query/filter validation and pagination, suspension/session revocation, transactional audit rollback, subscription transitions, expiry preservation, revenue deduplication, CLI role changes and crossing administrator suspensions. Subscription integration tests verify administrative activation against a mocked payOS provider. Browser tests exercise pages/APIs, CSRF/origin rejection, confirmation cancellation, audited changes, pagination/debounce, responsive navigation and preserved Host/Member entry points.

Production sequence, **requiring explicit approval before production writes**:

1. Back up the existing database and retain the currently deployed image and private configuration using the existing release runbook.
2. Validate migration and privileges on a safe staging clone. Review all other pending workspace migrations separately.
3. Apply the reviewed `0003_admin_dashboard.sql` with the existing PostgreSQL operator connection, for example `psql -v ON_ERROR_STOP=1 -f migrations/0003_admin_dashboard.sql` from `v2/`. Use private environment/service configuration for the connection. Add runtime grants as described above. Do not run the loopback-only test bootstrap against production.
4. Build/deploy the application through the existing Dokploy process without changing database/session/media secrets. Existing Docker standalone checks remain in place. Verify `/health` and `/ready`, then anonymous/Host/Member denials at `/admin` and `/api/admin/users`.
5. Keep existing trusted admins, or run the reviewed offline setup only for an explicitly approved account. Sign in and verify admin lists, audit visibility, metrics definitions and Host/Member compatibility.
6. Confirm the desired price/trial policy explicitly before changing those environment settings. Configure payOS only if activation/checkout is needed; read-only subscription inspection does not require provider credentials.

Rollback the application image first if necessary; leave additive metadata/audit tables intact. Do not delete audit or payment history as a rollback mechanism. The removal of email-based automatic promotion is intentional and remains safe with pre-existing stored admin flags.

## Owner actions and implementation status

Implemented locally: all Phase 1 routes, independent shell, server authorization, data-backed analytics, filtered/paginated inspection, account suspension, supported subscription administration, audit history, additive migration, configuration and offline role setup. Existing workspace changes belonging to other tasks are preserved.

Requires deployment: the migration/grants and the new application image. Requires manual owner decisions: trusted initial account if none exists, explicit production rollout approval, and whether to retain current pricing or adopt the proposed pricing. Production migration, deployment, secret changes and real administrative grants have **not** been performed. Historical creation dates, account-wide profile names, exact cohost session authorship and automatic recurring-payment commitments cannot be reconstructed from the old schema; their limits are surfaced rather than fabricated.

Main implementation files: `v2/src/app/admin/`, `v2/src/app/api/admin/[...path]/route.ts`, `v2/src/features/admin/`, `v2/src/server/modules/admin/`, `v2/src/server/db/admin-schema.ts`, `v2/migrations/0003_admin_dashboard.sql`, `v2/scripts/admin-access.mjs`, `v2/src/server/modules/subscriptions/policy.ts`, and the new admin integration/browser tests. Existing auth, permissions, member-access, subscription, legacy trial adapter, readiness, configuration and test preparation were extended; the platform-ledger page/actions were moved into `/admin`.

## Recorded verification — 2026-11-14

| Check | Executed result |
|---|---|
| Local `db:test:prepare` | Passed on the existing disposable loopback `sporthost_test`; no database reset |
| Complete Vitest run with serial files and 30-second hook timeout | 235 tests passed, 0 failed, across 22 files |
| Admin + foundation integration checks after the final migration indexes | 19 tests passed across 2 files, including repeatable migration and legacy schema compatibility |
| Full desktop/mobile Playwright run | 31 passed and 5 initially failed; failures identified a stale CSRF fixture, an asynchronous fixture assertion and admin table overflow |
| Final rerun of `admin-dashboard.spec.ts` and `club-connections.spec.ts` on both projects | All 6 passed after the fixes, including all 5 previously failing scenarios; all 36 distinct browser scenarios have now been observed passing across the full and targeted runs |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including standalone artifact scan for private/test files |
| `node --check scripts/admin-access.mjs` | Passed |
| `git diff --check` | Passed |
| Visual/layout inspection | Overview and users checked at 375, 768, 1024 and 1440px; document width equals viewport width at all four sizes |
| Lint | No lint command is configured in this repository |
| Production rollout and real admin grants | Not executed; explicit owner approval is required |

Browser fixes preserve the signed CSRF protection: tests fetch a fresh token after signup and wait for the owner's mutation to finish before inspecting another account. The table fix positions screen-reader-only labels inside the scrolling container, preserving table accessibility without causing page overflow. Chart date labels remain readable outside the scaled SVG.

Private local verification artifacts are ignored by Git: `.local/admin-verification/vitest.json`, `.local/admin-verification/e2e-final.json`, and the overview/users screenshots for all four widths under `v2/`. These use synthetic test accounts and actual local test records; they are not production metrics. The complete 36-test suite was not rerun a second time after the targeted fixes; the final 6-test rerun covers every previous failure.
