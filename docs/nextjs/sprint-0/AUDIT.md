# Audit hệ thống hiện tại

## Evidence and scope

Audit reads the working tree, not just HEAD. Existing uncommitted deployment changes are part of the baseline and remain untouched. No AGENTS.md was found in this workspace. Generated [inventory](INVENTORY.md) and [JSON manifest](inventory.json) enumerate every Python file under the root, `app`, `alembic`, `scripts`, and `tests`, with hashes, definitions/calls, all route signatures, ORM mappings/constraints and test names. Templates and static assets are also inventoried. Private `.vercel` scratch programs, credentials, old exports and built artifacts are **not application source** and must not be packaged into v2.

Runtime: FastAPI + Starlette + Jinja2, synchronous SQLAlchemy 2/psycopg, plain browser JS/CSS, Alembic, Pillow, ItsDangerous, SMTP/optional Resend, private Vercel Blob or explicit local storage. Python `index.py`/`vercel.json` are the old Vercel entrypoint; Docker runs `scripts.serve`, one Uvicorn process, internal port 8000, non-root UID 10001. Current Dockerfile never migrates on startup.

**89 application routes: 30 GET and 59 POST** (method totals are checked against the generated manifest). Framework-generated `/openapi.json`, `/docs`, `/docs/oauth2-redirect`, `/redoc` and the `/static` mount are separate from this business-route count. No third-party consumer of the generated OpenAPI docs is established; do not promise external API compatibility without consumer verification. No Express/Nest service, worker queue, OAuth callback or autonomous scheduler exists.

## Business domains and invariants

| Domain / Python source | Existing behavior that v2 must preserve | Legacy regression source |
| --- | --- | --- |
| Accounts — `main`, `accounts`, `security`, `mail` | Signup/login; normalized email; 10–256 character passwords; logout; CSRF; 14-day signed session with `session_version`; password change revokes old sessions; 30-minute one-use verify/reset tokens; reset requires available mail; admin allowlist/verification; disabled email never claims success | `test_flows`, `test_roadmap`, `test_deployment`, `test_dokploy` |
| Clubs — `main`, `club_settings`, `sports` | Owner, name/location; seven sport codes; skill, capacity 1–200, approval/fee defaults, policies, directions; absent legacy form fields preserve values; complete settings audit; club changes never rewrite session/accepted booking policy | `test_club_settings`, `test_fixed_member_fees`, `test_sprint01` |
| Members — `main`, `workspace` | Fixed/guest classification independent of male/female/unspecified; VN phone aliases normalize +84/84/0, general 9–15 digit phone validation; uniqueness per club; membership changes do not reprice accepted history; no guest Host account required | `test_member_gender`, `test_guest_lookup`, `test_flows` |
| Access — `permissions`, `workspace` | Owner all capabilities; legacy manager = session/bookings/check-in; legacy finance = finance only; custom capability set; contacts require booking or finance rights; settings rights do not grant owner/delete/cohost rights; revocation immediately takes effect; cross-club 404 vs same-club denied 403 | `test_closing_permissions`, `test_club_settings`, `test_club_deletion` |
| Workspace — `workspace`, `main`, templates/JS | Dashboard, clubs, filtered schedule/member lists, monthly finance views, navigation per permissions, Vietnamese UX, mobile roster actions, account/admin pages; summaries computed only from accessible clubs | `test_roadmap`, all browser tests |
| Sessions — `main`, `workspace`, `booking_service` | Individual/recurring creation; published policy/price/QR snapshots; 1–200 capacity; male/female quotas; maps host allowlist; registration/cancellation/RSVP deadlines in Vietnam local wall time; new SESSION_FEE default; existing EXEMPT_PAID histories retained; reasoned policy edit; fee-policy freeze after bookings | `test_group_bookings`, `test_fixed_member_fees`, `test_roadmap` |
| Recurrence/RSVP — `workspace`, `payments` | Weekly rule 1–12 initial weeks; extend 1–12 to max 52; RSVP priority window 0–168h; stop/generate; unique `(recurring_rule_id, starts_at)`; fixed-member invitations once; guests open after RSVP priority; member yes/no and eligible waitlist promotion | `test_roadmap`, `test_group_bookings` |
| Guest entry — `main`, `booking_service`, `booking_routes` | `/join/{public_id}` supports direct/Facebook source; phone-first lookup; no profile disclosure without ownership cookie; signed 15-minute review token bound to phone/session/profile version; existing contact requires matching name; no taking over cancelled booking; idempotent duplicate submission; group 1–20 people under one contact | `test_guest_lookup`, `test_group_bookings`, `test_hardening`, `test_group_booking_browser` |
| Capacity/decisions — `main`, `booking_service`, `payments` | Count participants rather than booking rows; no-show frees a seat; pending/invited do not reserve seats; approve entire group or waitlist entire group; unspecified gender cannot consume gender-quota seats; AUTO/MANUAL behaviors differ; eligible FIFO scan promotes at most one group; manual guest waitlist is not auto-approved; edits growing a group can require reapproval | `test_group_bookings`, `test_roadmap`, `scripts.check_group_concurrency` |
| Guest capabilities — `booking_service`, `payments`, `booking_routes` | `/attend/{key}`; digest lookup, HMAC-derived nonce token, expiry (normally 180 days after max(now,start)), revocation/rotation; old plaintext/digest URL acceptance until real expiration/revocation; QR and proof access bound to booking; no raw capability persisted in modern booking rows | `test_group_bookings`, `test_guest_lookup`, `test_hardening` |
| Attendance/lifecycle — `attendance`, `workspace`, `main` | OPEN → IN_PROGRESS → PLAY_FINISHED; reason to reopen; cancellation; independent per-person NOT_MARKED/CHECKED_IN/NO_SHOW, arrival/exit, version conflicts and retry behavior; reset present requires reason; replacement and walk-ins respect seat quotas; guest self-edit blocked after attendance/finance; attendance is not payment or settlement | `test_attendance`, `test_attendance_browser`, `test_real_session_browser` |
| Prices/dues — `main`, `payments`, `workspace` | Integer VND, 0–100,000,000 per accepted amount; fixed/guest gender overrides including explicit zero; no new gender price applied to old booking lacking fee snapshot; unique monthly period per member; bulk fixed-member dues idempotent; historical amount/QR/bank preserved; manual due collection; no duplicate monthly/session exemption | `test_member_gender`, `test_fixed_member_fees`, `test_billing`, `test_roadmap` |
| Billing — `finance_service`, `finance_routes` | FIXED_PRICE/COST_SHARING; allocated COURT/EQUIPMENT/OTHER expenses; no-show FREE/FULL and monthly EXEMPT_PAID/SESSION_FEE from accepted policy; discounts/exemptions with reasons; exact 1 VND remainder distribution by participant ID; zero billable people exposes unallocated loss; arrivals/exits never implicitly discount | `test_billing` |
| Issue/ledger — `finance_models`, `finance_service` | Issue only after play finished and all confirmed people marked; expected draft fingerprint prevents stale issue; immutable batch/charges/detail/payment snapshot; GROUP/SPLIT payers; explicit legacy paid opening once; partial receipts, overpayment credit, refund and reversal append records; idempotency key collision must compare payload; signed money, no refund below zero net; proof/reversal uniqueness | `test_billing`, `test_hardening`, `scripts.check_group_concurrency` |
| Close/adjust — `finance_service`, `finance_routes` | SETTLED locks attendance/billing basis but can leave debt; collection allowed after close; subsequent versioned adjustments append rows with reasons and never rewrite original charges/batch snapshot; repeated close has no duplicate audit | `test_closing_permissions` |
| Proof/media — `payments`, `storage`, `payment_config` | Static QR and bank text versioned together for booking/due/batch; old unresolvable QR/text combination requires verification rather than showing mismatched details; private PNG/JPEG/WebP input MIME+magic validation, 16M pixel ceiling, 1600px re-encode; QR 2MiB/proof 3MiB; duplicate proof detection; authorization on each image; upload = report only; host explicitly confirms/rejects and enters received amount after issue | `test_billing`, `test_roadmap`, `test_hardening`, `test_dokploy` |
| Platform — `accounts`, `platform_ledger` | Platform admin/trial extensions; independent operator income/expense ledger, idempotent create, versioned reasoned edits/audit; no club ledger/QR side effects; optional price/trial display envs; no automatic SaaS subscription charging | `test_closing_permissions`, `test_roadmap` |
| CSV — `main`, `workspace` | Finance-protected game/member attendance and finance export; UTF-8 BOM, CSV quoting, formula-prefix escaping; totals from ledger after issue | `test_flows`, `test_member_gender`, `test_roadmap` |
| Deletion — `main`, `club_deletion` | Existing user-invoked owner-only typed-name club deletion; FK-safe child ordering; audit detached/preserved; commit before media cleanup; rollback keeps files; other clubs unaffected | `test_club_deletion`, `test_club_deletion_browser` |

`SubscriptionRequest` remains a persisted historical entity even though the current application registers no subscription-request mutation endpoint. Do not delete the table or invent a paid checkout feature. `pro_ends_at`, `trial_ends_at` and every existing account flag remain intact.

## Database and runtime observations, 03/11/2026

New read-only inspection, not copied from the older deployment docs:

- PostgreSQL **18.6**, TLS active on the client, `SHOW transaction_read_only = on`, revision **0011_fixed_member_fees**.
- 22 physical tables including `alembic_version`; 21 application ORM models. Schema metadata report records columns, constraints, indexes and sequences without row exports or secrets.
- Counts: hosts 1, clubs 1, members 1, game_sessions 1, audit_logs 1; other business tables zero. `request_limits` is ephemeral activity and was 18 at inspection, not a permanent migration reconciliation total.
- One host hash has the expected legacy format. No current booking plaintext keys/missing nonces or due keys to backfill. This empty financial snapshot **cannot prove** rich legacy financial compatibility: use synthetic fixtures plus a fresh restored snapshot before release.
- Existing pooler accepts default transaction read-only startup options but rejects some other startup parameters. Set statement/lock timeouts inside transactions; do not blindly copy libpq `options` into a Node connection URL.
- Dokploy read-only API observation: existing `sporthost-production` Application status `done`, one replica, Dockerfile build. No create/update/deploy was invoked during Sprint 0.
- Strict-TLS anonymous GET `https://sporthost.vercel.app/health` and `/ready`: **200**. Custom apex did not resolve from the local resolver; apex/www HTTPS checks failed connection. No DNS records changed.
- Known local environment snapshots contain masked signing/schema fields. Database credentials work; secret presence does not prove a signing key is usable. Retrieve the deployed runtime key privately before v2 link tests.
- SMTP credentials/sender were absent in the inspected production env snapshot. User chose SMTP; provider/account details must be supplied privately before delivery acceptance. No account emails were sent.

## Risks discovered and explicit treatment

| Risk | Required treatment before release |
| --- | --- |
| GET handlers can mutate: club page generates missing monthly keys; game page ensures booking token fields; participant page scrubs/mints keys and commits | Make Next read paths genuinely read-only. Do missing-token compatibility work in an explicit, reviewed transaction or mutation path; never regenerate valid links or extend expiry on reads. Test restored old rows and read-only mode. |
| SQLAlchemy before-flush listeners initialize participants/policy/payment/token snapshots | Port into explicit TypeScript transaction services used by **every** booking/dues creator: public join, fixed add, recurrence, invite, walk-in. Drizzle has no equivalent implicit listener to rely on. |
| Current templates hide finance/contacts after rich server queries | Return minimal permission-scoped DTOs before any React serialization; inspect HTML, RSC/flight, JSON, image and CSV responses. UI hiding alone is insufficient. |
| SQLAlchemy models are not identical to historical DDL defaults/indexes | Baseline physical catalog from a read-only source and compare on clone. Preserve ORM-only defaults in services explicitly; do not regenerate legacy tables from annotations. |
| JSON snapshots/datetimes are strings, local session wall times vs UTC audit timestamps | Preserve physical types and raw historical snapshots; no automatic JSONB/date/timestamp conversion. Explicit timezone parsing and stable canonical hashing tests. |
| In-memory lookup limiter vs multi-instance DB limiter | Retain DB-backed limiter; trusted proxy origin/IP must be audited for the preview and production service. Do not accept arbitrary forwarded IP. |
| File/object writes cannot participate in DB transaction | Temp file + atomic rename; remove newly created file on rollback; never delete a referenced old QR/proof before commit. Durable cleanup/retry design before enabling retention. |
| Existing blob bytes are external | Copy every referenced non-expired object into isolated volume, verify SHA256 and original key paths; retain original store/fallback throughout observation. Empty current asset count is not permanent proof there will be no objects at cutover. |
| Historic Python test suite uses TestClient, SQLite and direct ORM assertions | Keep it as legacy baseline. Port business assertions to Vitest + real PostgreSQL integration + Playwright; do not describe passing Python tests as v2 parity. |
| Existing full club deletion intentionally removes financial rows | Preserve the explicit product operation behind ownership/CSRF/typed confirmation. Migration/deploy must never invoke it. Archiving instead would be a product change requiring user agreement. |
| Rollback Python may not understand v2 session cookie but understands existing password hashes | Keep accounts/password format, table and old fields backward compatible. Document possible re-login; never force password resets or restore old data over later transactions. |

## Operational script inventory and replacement scope

All scripts are listed with calls/hashes in `inventory.json`. New target image must not invoke Python for any of them.

| Existing scripts | Effects / v2 disposition |
| --- | --- |
| `check_db`, `dokploy_preflight`, `dokploy_smoke` | Read-only checks; retain GET-only smoke contract and port to TS/operator tooling |
| `backup_dokploy_source`, `verify_dokploy_backup` | Native dump/media archive, local-only restore and source compatibility; keep immutable artifacts, use native PostgreSQL + TypeScript tooling for future drills |
| `backup`, `check_backup_restore` | Legacy ORM backup/restore; some restore paths invalidate sessions/email links intentionally, so these are not transparent migration-clone tooling |
| `verify_release`, `apply_verified_release`, `migrate`, Alembic | Schema writes possible; **not invoked**; superseded for new changes by reviewed SQL + Drizzle journal. Keep Alembic history untouched. |
| `check_group_concurrency` | Creates/migrates/drops generated schemas on supplied server; **not run against production**; run races only on approved disposable local/preview database |
| `smoke_group_release` | Real signup/join/payment writes and SQL cleanup on supplied target; never a production read-only smoke |
| `scrub_booking_tokens` | Mutates guest secrets/participants; do not run automatically or recalculate tokens at migration |
| `retention` | Deletes eligible rejected proof media with `--apply`; default is count-only. No cron currently configured. Replace deliberately, preserving audit rows. |
| `admin` | Explicit allowlisted operator grant/revoke; preserve role/account semantics, no automatic promotion |
| `serve` | Uvicorn runtime; target uses Node Next standalone server only |
| `dokploy_api_ssh` | Authorized SSH localhost API adapter; use read-only for inspection; mutations only within the preview authorization/release gates |

No live migrations, storage copy/deletion, production write tests, role changes, scheduled jobs, DNS edits or deployments occurred in this audit.
