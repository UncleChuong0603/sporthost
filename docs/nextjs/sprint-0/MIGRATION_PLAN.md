# Phased migration to SportHost v2

User authorized the refactor through production and explicitly required audit first. Local reversible implementation may continue after Sprint 0; do not repeatedly ask for permission to implement. User also authorized one temporary Dokploy preview and selected VPS volume + SMTP. Preserve existing production throughout validation.

## S0 — audit and design (completed source baseline)

Deliver: complete generated Python/route/model/test/asset inventory, domain rules, crypto/database compatibility, architecture, route-by-route parity list and acceptance matrix. Evidence: 137 default Python cases + 10 browser cases passed; read-only production metadata and offline Python→Node compatibility. Production PG write tests have not run; actual SMTP configuration is absent. Details in [VALIDATION.md](VALIDATION.md).

No feature rewrite until these documents and inventory are coherent and generated `--check` passes. The new user DNS change is recorded as owner action, not an agent change; verify propagation/TLS independently.

## S1 — isolated Next foundation and compatibility

Build in `v2/`; leave existing Dockerfile/app intact. Select maintained exact package versions from official registries/docs, pin lockfile, verify build/runtime requirements. App Router/React/TS, Tailwind/shadcn, Zod/RHF, Vitest/Playwright; TanStack Query available only where used. Next standalone Docker; server config validation, pg/Drizzle connection module, role-scoped service pattern, health/ready and safe errors.

Provision disposable local PG (existing portable tools are available; no Windows service required), restore verified data or build baseline from reviewed native schema, isolated media and mail sink. Introspect Drizzle from clone; never run generated initial SQL on production. Implement strict legacy password/cookie/token/CSRF verifiers with synthetic fixture tests, no rehash/reset. Set up original user account/role parity on clone and regression harness. No dashboard full of invented business data.

Exit: A01/A02 foundations, DB field/constraint diff, config tests, Vitest and build pass; Docker build proves no Python runtime. Additive SQL, if needed, is reviewable before any production request.

## S2 — accounts, clubs, members, access and workspace

Port signup/login/account/reset/verify, club/settings/member flows, permissions and scoped read DTOs; owner/admin distinctions, CSRF/legacy form adapters. Apply existing design-system direction and Vietnamese mobile UX; shadcn accessible controls. Port dashboard/navigation/filtering without leaking private data in React serialization. SMTP adapter/sink; no production email enablement until credentials+delivery verified.

Exit: A01–A04, A15 read/CSV parts, A17 relevant forms, A21 sink tests; original passwords work; no missing route in these domains; old code still compatible on clone.

## S3 — scheduling, guest booking and attendance

Port one-off/weekly rules and invite/RSVP, all existing guest URLs/cookies, phone-first privacy, group seat/quota policies, decisions/waitlist and token lifecycle. Explicitly replace SQLAlchemy flush initializers in each creator. Port lifecycle/attendance/replacement/walk-in and version conflicts. Lock-order review across all capacity-changing commands.

Exit: A05–A09 and A17 roster; independent PG race tests pass; old URL matrix accepted/expired/revoked/rotated correct; no implicit read-side token regeneration. Link compatibility does not rely on a FastAPI call.

## S4 — complete financial parity and private media

Port fixed/gender/monthly fees, exact cost sharing, billing draft/hash/issue, immutable snapshot, GROUP/SPLIT, partial receipt/overpayment/refund/reversal, proof manual review, close-with-debt/adjustments, platform ledger and financial exports. Preserve ledger vs pre-issue legacy behavior and audit. Implement durable private image volume and copy/reconciliation tool; all writes/reverts fault tested. Implement existing explicit club deletion with safeguards.

Exit: A10–A16, all money races and fault injection pass, immutable history and financial totals exactly reconcile; screenshot upload never confirms payment automatically. Media restart and rollback exercise succeeds including a **new v2-only proof**.

## S5 — full regression, Dokploy preview and operational readiness

Create only the authorized preview Application in the existing Sport Host project, using unique name/identity, no production domain and no automatic Git deployment. Exact Next image, separate DB connection/schema environment, persistent preview volume, mail sink/disabled email. Existing production database is never the preview write target. Resource checks first; no shared proxy restarts, app pruning or unrelated changes.

Run all A01–A21 on rich fixtures and fresh restored snapshot. Build Node-only image, verify native image library on Linux, actual memory/connections/startup, timeout/rate-limit/proxy and HTTPS media. Retain artifact checksum/image/source identity and old production artifact. Complete compatibility reads/writes from old Python against v2 data **only on clone**. Route CSV must have concrete test results for all 89 contracts.

Exit: complete release candidate, no required skips, approved storage rollback method works, actual SMTP acceptance/config ready or owner chooses explicit temporary mail-unavailable behavior. Full restore and rollback runbooks concrete. No release based solely on homepage/health.

## S6 — controlled production activation at sporthost.online

Only after S5 pass, prepare exact deployment/config/SQL/media diff and current DNS/zone/TLS observation. Ask for remaining required approval only with that concrete release candidate. User adding DNS is not approval to remove fallback or run destructive migration.

1. Refresh DB + all referenced media backup and prove isolated restore. Record current old image/source/env identity privately, full zone export/old values, both entrypoint writer state and known legacy URL examples without exposing capabilities.
2. Review any **additive** production DDL separately; never destructive DDL. Preserve `clubhost`, rows, columns, password hashes and Alembic history. No migration at web startup.
3. At agreed window disable writes on both legacy and v2 entrypoints and drain in-flight requests. Verify no unknown job/writer continues. Copy/reconcile every image, including new objects since last snapshot, onto persistent volume; compare counts/hashes and financial/account baselines.
4. Deploy the exact verified Next artifact to the existing production Application with internal port/mount/health settings updated deliberately. Vercel fallback remains live, read-only during handover; retain existing app data and images. Route apex only after strict TLS and readiness succeed.
5. Verify canonical domain, redirects, all anonymous safe GET routes and known old URL families. Do not use `curl -k` or bypass certificate failures. User-owned website DNS is now being configured; recheck authoritative/public resolver convergence and TLS. `www` is a separate DNS record if that alias is required.
6. Enable one normal writer at the agreed activation point, keep proof confirmation manual, verify health/logs and real user behavior. Do not run synthetic production financial/write fixtures.
7. Observe a proposed minimum 48h (actual window agreed at release); retain Vercel, original Blob, old image and new volume backups. Roll back traffic/image with all new transactions and files retained. Never restore an old backup over live new records as a routine rollback.

Final acceptance: `https://sporthost.online` serves the tested Next app, correct TLS/canonical routing, preserved accounts/features/history/links, production session/media/mail controls, no Python process/runtime in v2 image, and tested rollback/backup evidence. Legacy runtime retirement is a distinct action after old-host URL compatibility and observation are proven; archive source/tests and historical Alembic, do not delete data.

## Decisions and external dependencies

| Item | Status / action |
| --- | --- |
| Temporary preview Application | Owner approved in this conversation; proceed when a tested artifact exists |
| Persistent volume + SMTP | Owner selected; implement, then request only missing private SMTP host/port/auth/sender details before delivery-dependent tests |
| DNS apex | Owner reports added A record 03/11/2026; verify resolver convergence and TLS. Agent does not modify records. Screenshot shows no `www` record. |
| Existing signing key | Need usable deployed value privately; masked env values cannot be used. Existing Dokploy API access allows private retrieval without printing secrets. |
| Database testing | Local isolated PostgreSQL allowed; keep production read-only. No need to ask for production write tests. |
| Production destructive DDL/DNS change | Explicit approval required by user; no such operation planned automatically |
| Production replacement/write activation | Present exact candidate, data/media reconciliation, downtime/rollback plan after tests pass; keep existing production until then |
