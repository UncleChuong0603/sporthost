# Dokploy migration audit — 2026-11-03 (Asia/Bangkok); initial observations 2026-11-02

Source plan: `C:\Users\CHUONG\Downloads\SPORT_HOST_DOKPLOY_MIGRATION_PLAN.md` v1.0.
This report distinguishes observations, proposed configuration and blocked acceptance.

**Latest owner scope:** one production Application only; no dedicated staging. The single-app runbook and verified local backup/compatibility evidence supersede the initial staging dependency. Authorized API access, production migration 0011 and actual deployment are now complete; DNS/certificate/normal-write activation remain pending.

## Source and hosting

- Initial Git worktree clean; HEAD `429f162`. Origin `UncleChuong0603/sporthost` on GitHub. No applicable AGENTS.md found.
- Single FastAPI/Jinja2 application, SQLAlchemy/psycopg, Alembic; no frontend build, Node runtime, Edge functions, Redis or queue service required. Choose **Dokploy Application**, Dockerfile at repository root, context `.`, port **8000**. Do not provision Compose, PostgreSQL or another proxy.
- `.python-version` specifies 3.12; pre-existing local `.venv` uses 3.11.9. Migration validation also uses an isolated downloaded Python 3.12; see final test results in MIGRATION_REPORT.
- Direct requirements are version pinned. Docker base is pinned to the registry manifest digest obtained during audit. `requirements.lock` pins Python 3.12 dependencies with platform markers and hashes, including the Linux graph; Docker installs with --require-hashes. Explicit tzdata supplies IANA zones in a slim image. Retain the built image digest for an exact rollback.
- Existing Dockerfile ran Uvicorn as root on 8000. Revised image runs UID/GID 10001, production defaults, configurable PORT, readiness healthcheck, no startup migration, no access logging of capability/reset URLs.
- Vercel entrypoint `index.py`; `vercel.json` selects FastAPI, Singapore, function maxDuration 30, three security/beta headers. There are no rewrites, scheduled Vercel jobs or Edge paths. Static `/static` is served by Vercel CDN there and FastAPI in containers. Container middleware preserves the response headers.
- `https://sporthost.vercel.app`: GET health, ready, login and CSS all 200 with Vercel response markers. No production writes performed. `sporthost.online` currently does not resolve to a website.
- Linked Vercel project metadata exists locally. No Vercel CLI on PATH. Read-only project/env/domain API calls using existing CLI auth returned **403**. Live project settings, Git branch, current deployment commit, environment and domain association cannot be certified.
- Private local Vercel env snapshots exist. Some values are literally `[SENSITIVE]`, including APP_ENV, DB_SCHEMA, SECRET_KEY and ADMIN_EMAILS. Presence is not proof of a usable credential; masked values are unusable. Actual credentials were obtained from existing private configuration; the original signing key was verified against a live public Vercel CSRF token. No secret values are copied into this report or source.

## Database and private media

- The database URL from the local snapshot reaches external PostgreSQL **18.6**. It is not the VPS loopback database/tunnel. Do not repoint to the unrelated listener at VPS 127.0.0.1:15433.
- Explicit read-only transaction against known application schema `clubhost`: schema exists, role has USAGE and CREATE, Alembic revision **0010_payment_config_snapshot**. Counts at audit: hosts 1, clubs 1, game_sessions 1, bookings 0, stored_assets 0, payment_proofs 0. These are the pre-migration snapshot counts. The owner subsequently confirmed this database/schema as production and approved 0011.
- Repository head is **0011_fixed_member_fees**. Never deploy this code against revision 0010 without resolving compatibility. Existing migration 0011 adds Club fee columns and changes the monthly_policy server default. After explicit owner approval and fresh verified backup/restore, it was applied to production. All 21 business-table legacy-column hashes were unchanged; current readiness passes. No additional migration was created for hosting changes.
- `/ready` now validates Host access plus a zero-row SELECT of current Club columns, so the known missing-0011 schema fails readiness without exposing database details. `/health` remains independent of the database.
- URL requests `sslmode=require`; psycopg client connection reports **TLS in use**. Backend `pg_stat_ssl` reports false behind the managed proxy and is not the client TLS indicator. Actual container readiness verifies egress and current-model SELECT access against this existing TLS URL; owner confirmed database identity. The existing DB role was retained, not replaced or narrowed. A separate least-privilege role remains a future reviewed permissions change.
- A fresh native backup of the inspected Neon source has now passed actual LOCAL restore and 0010 -> 0011 verification: 22 tables, 24 rows, all legacy column hashes preserved. Private Blob app-prefix listing succeeded with zero objects. See BACKUP_AND_COMPATIBILITY. The owner confirmed production DB identity; provider retention/PITR remains unverified.
- Current ORM-based backup exporter expects the 0011 columns and must not be used unmodified for a 0010 pre-upgrade backup. The new native backup script is independent of ORM revision; no remote restore was run. The approved migration was applied separately only after backup/local restore verification.
- Production storage uses Python `vercel-blob` private objects with BLOB_READ_WRITE_TOKEN (or Vercel-specific OIDC/store identifier). Dokploy must use the real read/write token, **not** Vercel OIDC. Keep the SAME production store so old keys and Vercel rollback work. Do not delete the Blob store when eventually retiring Vercel compute.
- Existing image routes enforce club permissions or guest capabilities; media is not mounted as static. No stored_assets rows in the inspected snapshot target; the successful app-prefix Blob archive is empty, so no existing real object was available for a retrieval/restart check. The same external Blob store is retained through both actual deployments.
- Optional local backend is now explicit: STORAGE_BACKEND=local, absolute STORAGE_ROOT and a Dokploy persistent mount. Writes use atomic replacement. Switching an existing store to local requires separate approved copy/hash verification and a write freeze; no files were moved.

## Auth, callbacks, security and jobs

- Signed `clubhost` sessions, 14-day cookies, HttpOnly, SameSite=Lax; production requires Secure and existing SECRET_KEY. Preserve key and cookie name to retain signed guest links and session compatibility; cookies from the old vercel.app hostname cannot transfer to the new domain.
- No OAuth/external login callback exists. Verification/reset links now use APP_URL, falling back to legacy PUBLIC_BASE_URL. Production origin must be HTTPS. No email-verification/admin bypass added.
- Explicit ALLOWED_HOSTS required for non-Vercel staging/production. Canonical www redirect only for the configured and allowlisted alias. Traefik owns HTTP-to-HTTPS and certificates. Uvicorn accepts forwarded headers only from configured FORWARDED_ALLOW_IPS; audit actual overlay source before setting it. Never use `*` with an exposed app port.
- Existing same-origin app, signed CSRF, database-backed rate limiting, permission/tenant checks and validated/re-encoded image uploads are retained. On Dokploy the trusted proxy middleware supplies socket client IP to rate limiting; arbitrary forwarded headers must not be trusted.
- APP_READ_ONLY=true blocks unsafe HTTP methods and sets PostgreSQL default_transaction_read_only=on for preview, including legacy GET writes. The inspected Neon endpoint was verified to honor the read-only session option using SHOW queries, without any attempted writes.
- No in-process scheduler or Vercel cron found. Recurring session generation is request/operator driven. Existing retention/admin/migrate/smoke_group_release/apply_verified_release scripts can mutate data: **not invoked**. Do not enable them as scheduled jobs at migration time.
- Access logs disabled in production runner because paths/query strings contain capabilities/reset tokens. Controlled mail adapter logs provider category only. No new CSP/CORS policy added that could break existing assets/forms; preserve existing CSRF behavior.
- Existing account mail was SMTP only. Adapter now supports opt-in Resend, bounded transient retries using a stable idempotency key, SMTP compatibility and truthful disabled state. No booking/approval notification event existed; no unrelated new notification flow invented.

## VPS / Dokploy: actual deployed state

- Existing ssh sporthost alias succeeds; no public IP, SSH key or credential is recorded here. Ubuntu 24.04.1, kernel 6.8.0-138; Docker client 28.5.0. SSH account has no daemon/sudo access; no group/permission changes were made.
- Read-only resource recheck: 4 CPU, 3.8 GiB RAM with approximately 1.8 GiB available, root disk about 47.4 GiB with 24 GiB free. These are snapshots, not load capacity guarantees. Initial inodes 7% used; existing swap use needs observation.
- Dokploy loopback3000 responds200. Owner-provided API token permits normal SSH exec calls to the existing localhost API; no new tunnel/listener, service, installation or privilege elevation. Exact platform version and server backup policy are not independently certified.
- Reused existing project Sport Host / production and created exactly one Application sporthost-production, id oUctLiT_1JGDfDXbDDlwL. Dockerfile build/context., one replica, sourceType drop, autoDeploy=false. No Git push, webhook, dedicated staging, Compose, database or competing proxy.
- Two native Dokploy deployment events completed; latest E2uD2s-MiREQffR5-NWXn. Source ZIP SHA256 ab126b72b6839e2fe09788f9cb6338d363536e23261d120356d6c090b2b5256a, built image ID sha256:016d70ba622d0e63b6006459c4b698e4d52049e76c082cd010c79499945d40c9. Current own container healthy after redeploy. Source is reviewed worktree ZIP, not a pushed commit.
- Actual dokploy-network overlay subnet 10.0.1.0/24; proxy trust configured as 127.0.0.1,10.0.1.0/24. App has no public port bindings. Existing Traefik handles all domains/HTTPS, no shared proxy changes.
- Temporary generated domain passed nine anonymous external GET checks; no login credentials/cookies sent over HTTP. sporthost.online/www routes are configured for8000/HTTPS/Let's Encrypt; HTTP301 verified. Public production certificate remains invalid/pending approved DNS; no certificate validation bypass.
- Eight pre-existing container IDs/statuses remained unchanged and running after deployment. No unrelated app mutations, host pruning, firewall edits or shared service restarts.
- Original listeners include80/443,3000, Swarm ports, SSH and unrelated loopback15433. This is not a firewall/exposure audit. No listener or firewall modification was made.

## Runtime environment mapping (keys only)

All application configuration is **runtime**; no app build-time secrets/variables are needed. Do not pass runtime secrets as Docker build args. Table statuses describe the configured runtime unless explicitly marked missing/optional. Real values are not included.

| Vercel / existing key | Dokploy key | Required / status |
| --- | --- | --- |
| APP_ENV | APP_ENV | Configured production |
| DATABASE_URL | DATABASE_URL | Configured existing Neon TLS URL; owner-confirmed |
| DB_SCHEMA | DB_SCHEMA | Configured existing clubhost, now0011 |
| SECRET_KEY | SECRET_KEY | Configured original key; live public CSRF signature verified |
| COOKIE_SECURE | COOKIE_SECURE | Configured true |
| PUBLIC_BASE_URL | APP_URL | Configured HTTPS production origin |
| none | ALLOWED_HOSTS | Configured apex/www, loopback and exact generated hostname |
| none | PORT | 8000; internal only |
| none | APP_READ_ONLY | true for temporary production preview; false only at approved activation |
| none | FORWARDED_ALLOW_IPS | Configured verified127.0.0.1,10.0.1.0/24 |
| BLOB_READ_WRITE_TOKEN | BLOB_READ_WRITE_TOKEN | Configured retained token; source listing/backup succeeded |
| BLOB_STORE_ID / VERCEL_OIDC_TOKEN | omit | Do not transplant Vercel-managed OIDC to Dokploy |
| none | STORAGE_BACKEND | blob for initial production cutover; auto supports old Vercel behavior |
| none | STORAGE_ROOT | Only for explicitly migrated local backend with persistent mount |
| none | EMAIL_ENABLED | false until sending domain/key/test verified |
| none | EMAIL_PROVIDER | resend |
| MAIL_FROM | EMAIL_FROM | Required only for enabled mail; choose verified sender |
| none | RESEND_API_KEY | Missing; required only for enabled Resend |
| SMTP_HOST/PORT/USER/PASSWORD, MAIL_FROM | same | Optional legacy SMTP only; not needed for Resend |
| ADMIN_EMAILS | ADMIN_EMAILS | Configured from existing verified platform admins; no privilege grants |
| PLATFORM_TRIAL_DAYS | same | Optional existing default 30 |
| PLATFORM_CLUB_MONTHLY_VND | same | Optional existing default 99000 |
| DATABASE_URL_UNPOOLED | operator secret only | Migration/backup connection; not runtime unless deliberately selected |
| PG*, POSTGRES_*, NEON_PROJECT_ID | omit | Provider aliases not read by application |
| NX_*, TURBO_*, VERCEL_* | omit | Provider/build metadata; VERCEL MUST be absent in Dokploy |

## Remaining dependencies

1. Export/confirm authoritative DNS zone/old values and verify the privately recorded VPS destination in the owner account.
2. Obtain explicit approval for website DNS/TTL and agreed normal-write activation; 0011 approval is already satisfied.
3. After approved DNS, verify public apex/www certificates, canonical redirect and GET-only acceptance, then enable writes at the agreed point on this same app. Keep Vercel live.
4. Resend key/domain/test delivery remain unavailable; actual EMAIL_ENABLED=false. Do not bypass existing verification/admin rules.
5. Select backup/monitoring schedule/retention and optional Git integration; these are documented, not installed. Retire Vercel only after observation and separate approval, retaining private Blob.
