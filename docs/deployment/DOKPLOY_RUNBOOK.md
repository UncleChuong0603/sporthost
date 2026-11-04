# SportHost — one production Application in existing Dokploy

The owner's latest instructions supersede the original staging requirement: **one application, sporthost-production; no dedicated staging environment**. Local disposable restore/migration verification is sufficient for preparation and does not create a VPS service. The app is deployed through Dokploy; DNS, public production TLS and normal-write activation remain pending approval.

## 1. Existing app and authorized access

The existing **Sport Host / production / sporthost-production** Application is deployed and healthy; applicationId `oUctLiT_1JGDfDXbDDlwL`. Do not create a duplicate. The original staging requirement was waived by the owner. Production DNS has not changed and this app remains APP_READ_ONLY=true.

SSH `sporthost` works. The owner-provided API key is in gitignored `.env.dokploy.local`. `scripts/dokploy_api_ssh.py` sends authorized API requests to server loopback 3000 through a normal SSH exec session. It sends the key through stdin, never argv/logs, and returns selected non-secret fields. No tunnel/daemon or Docker/sudo permission changes are needed. Use the existing owner dashboard to rotate keys; never extract session/database credentials from server files.

Read-only application status from the repository root:

```powershell
python -c "from scripts.dokploy_api_ssh import call; print(call('application.one', query={'applicationId':'oUctLiT_1JGDfDXbDDlwL'}, fields=['applicationId','name','applicationStatus','sourceType','buildType']))"
```

The authenticated container baseline contains eight unrelated running containers; all retained their IDs/statuses after both SportHost deployments. Installed Dokploy version and server backup scheduling are not independently certified. Never change shared proxy/firewall/service configuration to maintain this app.

## 2. Confirmed source, backups and approved migration

The owner confirmed the existing **Neon PostgreSQL 18.6**, schema **clubhost**, as production and approved **0010 -> 0011**. A fresh native backup and actual local restore/upgrade/read-compatibility drill passed before the production migration. The remote schema is now **0011_fixed_member_fees**; all old-column hashes across 21 business tables were unchanged immediately after upgrade. Do not repeat the migration or run a downgrade.

Fresh private backup: `.vercel/dokploy/backups/source-20261103-approved/`; restore evidence: `.vercel/dokploy/restore-approved-20261103/verification.json`. See [backup and compatibility](BACKUP_AND_COMPATIBILITY.md) for dump hash, source/default caveats and approval evidence.

Private Blob token successfully listed/backed up the application's clubs/ prefix (zero objects). The app retains the same external store. The original signing key was independently verified offline against live Vercel's public CSRF token. Some historical env snapshot values are redacted; they were not copied as real credentials. Live Vercel API auth still returns 403, so current deployed SHA remains unknown. Its health/ready and existing public session GET pass after migration; documented old source 8ee0239 also passed upgraded local-data read probes.

Future production schema/data changes still require a fresh reviewed backup and explicit approval. No migration runs at image build/startup. Do not disable readiness, remove features, overwrite data or downgrade schema to avoid a gate.

To repeat a fresh read-only backup with native PostgreSQL 18.6 tools:

```powershell
python -m scripts.backup_dokploy_source --env-file PRIVATE_ENV_FILE --schema clubhost --pg-bin PRIVATE_PG_BIN --output-dir .vercel/dokploy/backups/NEW_UNIQUE_DIRECTORY
```

This uses a shared exported snapshot in read-only transactions, exports only the named schema, backs up application Blob objects, and verifies archive hashes. It works with 0010 and does not import current ORM models. Never run the current ORM-based `scripts.backup` exporter on 0010 before upgrading; its SELECT references new Club columns.

To verify a backup locally, without accepting any remote restore URL:

```powershell
python -m scripts.verify_dokploy_backup --backup-dir PRIVATE_BACKUP_DIRECTORY --pg-bin PRIVATE_PG_BIN --work-dir .vercel/dokploy/NEW_UNIQUE_LOCAL_CHECK --vercel-commit 8ee0239
```

This launches a password-protected PostgreSQL process bound to 127.0.0.1, restores locally, compares hashes of all original columns, upgrades only the local copy, and runs GET/SELECT probes. It stops its own process and retains private artifacts. No OS service, dedicated staging environment or VPS database is created. Keep backups private/off-server, preserve original files and check retention with the owner.

## 3. Recorded single-Application configuration and source updates

The existing project is named **Sport Host** (reuse it), environment **production**, application **sporthost-production**. Build type Dockerfile, path `Dockerfile`, context `.`, one replica, internal **8000**. CMD is `python -m scripts.serve`; no startup migration/install hook, Compose stack, database service, public app/DB mapping or separate proxy.

Current sourceType is **drop**, using Dokploy's native source ZIP deployment. Auto-deploy and preview deployments are disabled. This avoids pushing unfinished changes to Vercel's production Git branch. No Git provider/webhook is configured for this app; manual deployment already works.

Recorded source ZIP: `.vercel/dokploy/sporthost-source-ab126b72b6839e2fe09788f9cb6338d363536e23261d120356d6c090b2b5256a.zip` (92 runtime files from reviewed worktree based on Git 429f162; no credentials/env/private artifacts). Current image ID: `sha256:016d70ba622d0e63b6006459c4b698e4d52049e76c082cd010c79499945d40c9`. Latest deployment `E2uD2s-MiREQffR5-NWXn` completed, current container healthy. The ZIP is immutable by content hash; keep it and the built image for rollback. The local image ID is not a published registry digest.

Rebuild/redeploy this exact reviewed source through Dokploy when authorized for an update:

```powershell
python -c "from scripts.dokploy_api_ssh import call; print(call('application.dropDeployment', body={'applicationId':'oUctLiT_1JGDfDXbDDlwL'}, zip_path='.vercel/dokploy/sporthost-source-ab126b72b6839e2fe09788f9cb6338d363536e23261d120356d6c090b2b5256a.zip'))"
```

For an environment-only update use Dokploy Environment, save only reviewed changed keys and deploy this app. The helper's env_patch option preserves all other environment values internally without printing them; it must be used only for authorized changes. Never include secrets as command-line literals. Do not blindly paste the example file, replace the entire environment with placeholders or enable writes just to run a preview test.

For new code: synthetic tests -> create a new runtime-only ZIP with SHA256 and secret scan -> deploy to this same app -> record source hash/image -> verify GET/health. Do not reuse the old filename for changed content. Alternatively connect a selected reviewed Git branch/commit in Dokploy and verify a real deployment event; no staging branch/environment is required. Do not push to Vercel's branch incidentally.

Runtime configuration is recorded in [production.env.example](production.env.example): existing DATABASE_URL/schema/SECRET_KEY/private Blob token; APP_ENV=production, APP_URL=https://sporthost.online, PORT=8000, COOKIE_SECURE=true, STORAGE_BACKEND=blob, APP_READ_ONLY=true, EMAIL_ENABLED=false, EMAIL_PROVIDER=resend. ADMIN_EMAILS comes from existing verified platform admins; no bootstrap/privilege grants. ALLOWED_HOSTS includes apex/www, loopback and the exact generated preview hostname. RESEND_API_KEY is absent. No build-time secrets or VERCEL/OIDC variables are needed.

Actual overlay network is dokploy-network, 10.0.1.0/24. FORWARDED_ALLOW_IPS is **127.0.0.1,10.0.1.0/24**, verified from the actual container network. Reverify it if Dokploy networking changes; never use a wildcard or change shared proxy configuration for this. Raw Uvicorn URL access logs are disabled to protect guest/reset tokens.

The base image digest and hashed Python 3.12 dependency lock are pinned. Regenerate deliberately with `uv pip compile requirements.txt --python-version 3.12 --universal --generate-hashes --output-file requirements.lock`, then retest. Keep recorded image/source identities for rollback.

No cron/queue worker is required by current source. Do not invoke the legacy release smoke, retention, scrub, admin or migration scripts on startup. They can modify data.

## 4. Storage and PostgreSQL

**Simplest storage: retain the existing PRIVATE Vercel Blob store.** Set STORAGE_BACKEND=blob and the original BLOB_READ_WRITE_TOKEN. Existing data is already external/persistent, so no upload volume is needed for this deployment. Do not replace the Blob store or delete it during Vercel compute retirement. Vercel OIDC is not a substitute for a reusable Blob token outside Vercel.

Local uploads are an optional future storage migration, not a cutover prerequisite. Only choose STORAGE_BACKEND=local and STORAGE_ROOT=/data/uploads after an approved complete copy/hash/delta verification. Then mount a dedicated Dokploy volume there, owned by UID/GID 10001, and never expose it as static. No storage switch/file copy was performed here.

Use the **existing external Neon endpoint with TLS**. It is not the VPS's unrelated loopback listener. Do not create another DB or rely on container localhost/SSH forwarding for this source. Actual container readiness passes against the existing schema, proving egress and current-model read access; source PostgreSQL client TLS was verified and the TLS URL is retained. No data-writing connectivity test is needed. A separate least-privilege runtime role would be a future reviewed database-permission change, not silently introduced here.

APP_READ_ONLY=true blocks unsafe HTTP methods before handlers and sets PostgreSQL `default_transaction_read_only=on` on every app connection. This also protects against existing GET handlers that may try to initialize tokens or recurring sessions. Such GET handlers can return unavailable while preview is read-only; do not bypass the guard to test them. Tests against the actual production data are GET/SELECT-only.

The image probes `/ready` every 30 seconds, after a 30-second start period. `/health` checks process liveness; `/ready` checks Host access/current Club columns. Never treat `/health` alone as acceptance while `/ready` is failing.

## 5. Temporary URL verification without DNS cutover

Create a temporary **Dokploy domain on this same application**, e.g. its generated domain; do not create a staging application or new DNS records. Add its exact hostname to ALLOWED_HOSTS. Generated traefik.me domains are normally HTTP, so use anonymous GET checks only and never send production login credentials/cookies over public HTTP.

The actual generated URL is stored privately in `.vercel/dokploy/temporary-domain.private.json`; public-IP-derived hostnames are not copied into tracked docs. Nine external anonymous GET checks passed; credentials_sent=false is recorded in temporary-url-smoke.private.json. Through authorized SSH exec, a GET to server localhost port 80 with this Host also returned health/ready 200. No persistent SSH forward is required. A valid temporary HTTPS hostname could also be tested with scripts.dokploy_smoke; current generated preview is HTTP only.

For approved production HTTPS verification after DNS:

```powershell
python -m scripts.dokploy_smoke https://sporthost.online --expect-email-disabled
```

The smoke helper additionally supports explicit localhost/Host routing for an already owner-managed local connection; it rejects public HTTP and non-loopback Host overrides. No tunnel is started by the helper.

Deploy only through Dokploy, inspect its deployment/app logs, verify the actual image/commit/port, readiness, PostgreSQL read-only/TLS and existing object read access. Run only `/`, `/health`, `/ready`, `/login`, `/signup`, CSS, an unknown page and unauthorized `/admin`; the smoke script issues GETs only. No signup/login POST, uploads, finance, club/session creation, cleanup or other write UAT against production data. Existing local regression/browser tests cover those flows with synthetic data.

Do not disable APP_READ_ONLY or reduce health acceptance merely to make preview pass. A schema mismatch must be resolved by the approved migration decision. Compare unrelated service health/restarts and VPS resource use after the SportHost deployment.

## 6. Prepare production domain / approved cutover

This application already has **sporthost.online** and **www.sporthost.online**, path `/`, port **8000**, HTTPS/Let's Encrypt through existing Dokploy; the app canonicalizes that alias to apex, and Dokploy handles HTTP-to-HTTPS. No separate reverse proxy or changes to other apps. HTTP301 redirects are verified, but the public production certificate is not valid before DNS. Issuance remains pending until approved DNS reaches the VPS; do not disable TLS as a workaround.

Follow [DNS_CUTOVER](DNS_CUTOVER.md). Confirm the real destination IP privately, old authoritative zone and rollback values. No DNS/TTL changes before approval. No blanket writes to the zone; preserve MX/TXT/email records. Keep Vercel running.

After explicit cutover approval, choose a short write-drain window if needed. Enable normal writes by setting APP_READ_ONLY=false **only on the same production app** and redeploy the already tested artifact at the agreed point. Verify the actual production domain/TLS externally; write-based production UAT remains out of scope unless separately approved. Non-mutating GET checks and logs/resources are sufficient for the current request. Keep EMAIL_ENABLED=false until key/domain/test delivery is separately verified.

## 7. Rollback and operations

For traffic rollback, restore the exact approved old DNS snapshot and keep Vercel available. No apex A/AAAA was found during audit, so do not invent a previous Vercel IP. The verified direct fallback is `https://sporthost.vercel.app`. Before rollback assess writes since cutover; never restore an old backup over newer transactions.

For an app-only rollback, select a recorded compatible image/commit in Dokploy. Do not downgrade database schema: migration 0011 deliberately refuses destructive downgrade. The tested old 0010 code can read the upgraded schema, with documented old-source local read compatibility and actual live Vercel reads verified; current live SHA and external writers remain unverified. Set the failing app read-only if needed. Restart/redeploy SportHost only, never the shared proxy.

Updates use the same app: local synthetic tests -> backup if schema/data changes -> deploy pinned artifact read-only -> GET preview -> approved production activation. No dedicated staging needed. Confirm branch/webhook mapping and an actual deployment event before declaring auto-deploy configured.

Record logs/metrics without raw capability/reset URLs. Proposed initial budget is one replica/worker, 0.5 CPU/512 MiB after checking shared headroom, and at most one build concurrently; these limits are not configured or load-tested. Monitor OOM/restarts, 5xx, certificate expiry, disk warning 75%/critical 85%, inode pressure and swap growth. Proposed backup retention: 7 daily/4 weekly/3 monthly copies, off-server encrypted storage, periodic local restore drill. These alerts/schedules are **not installed** here. Owner must confirm VPS/Neon/Blob/Resend quotas, egress and actual costs. Never prune the shared Docker host.

Rotate secrets through Dokploy and redeploy; SECRET_KEY rotation invalidates sessions/guest links and needs a deliberate plan. Only retire Vercel after successful cutover/observation and separate owner approval, preserving the existing Blob store and backups.

References: [Dokploy API/access](https://docs.dokploy.com/docs/api), [Applications](https://docs.dokploy.com/docs/core/applications), [Domains and temporary HTTP domains](https://docs.dokploy.com/docs/core/domains), [native PostgreSQL backup](https://www.postgresql.org/docs/current/app-pgdump.html).
