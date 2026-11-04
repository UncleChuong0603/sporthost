# SportHost migration status - 2026-11-03, Asia/Bangkok

**SportHost is deployed and healthy in the existing Dokploy installation. Production DNS cutover has not happened.** There is one sporthost-production Application in the existing Sport Host / production project/environment, with no dedicated staging. The app is intentionally read-only until approved activation. Vercel remains live at https://sporthost.vercel.app; Resend remains disabled.

## Completed and verified

- Audited the real FastAPI/Jinja2/Python 3.12 code, Vercel configuration, SSH server, external Neon PostgreSQL and private Vercel Blob. Reused existing Dokploy and Traefik; no additional deployment platform, database, proxy, firewall change or privileged SSH access was introduced.
- Created a native consistent backup immediately before the approved migration: **22 tables / 24 rows**, verified archive, actual local PostgreSQL restore, original-column hashes, local upgrade and old/current source read probes. Private app-prefix Blob archive is verified and empty (zero objects at snapshot).
- The owner confirmed the production Neon database/schema clubhost and explicitly approved **0010 -> 0011**. Applied 0011_fixed_member_fees after backup verification, with 5-second lock and 30-second statement timeouts. All original data in **21 business tables** matched pre-migration hashes. No destructive migration, production fixture, restore, upload or write-based test was run.
- Preserved the existing signing key; offline verification of a public live Vercel CSRF token confirmed it matches. Kept the existing DB and private Blob token/store. Existing verified admin identities supplied the allowlist; no account verification or privilege grant was performed.
- Configured Dockerfile build, one replica, internal port 8000, non-root UID/GID 10001, pinned base/dependency hashes, /ready healthcheck, explicit hosts/origin, secure cookies and verified proxy trust 127.0.0.1,10.0.1.0/24. No public application/DB port mapping or startup migration.
- Built and deployed through Dokploy's native source ZIP deployment. Both deployment events completed; the current container is **healthy** after redeployment. Runtime has APP_READ_ONLY=true, EMAIL_ENABLED=false, STORAGE_BACKEND=blob, existing required secrets present and RESEND_API_KEY absent. Blob is already persistent; no local upload volume is needed.
- Anonymous external temporary-domain smoke: **9/9 GET checks pass**. Root 303; health/ready/login/signup/CSS 200; unknown path 404; unauthenticated admin 401; forgotten-password 503 (email disabled). No credentials/cookies sent over the generated HTTP URL.
- Existing Vercel health/ready remain 200, and the existing public session page now returns 200 after migration. Documented old release 8ee0239 and current source both passed restored-data read compatibility checks. Exact current live Vercel SHA remains unavailable because its API credential returns 403.
- Configured sporthost.online and www.sporthost.online on this Application with port 8000 and Dokploy Let's Encrypt HTTPS. Both HTTP routes redirect to HTTPS. **A publicly valid production certificate is still pending DNS**; no TLS bypass is used.
- Compared eight pre-existing container IDs/statuses before and after deployment: **all eight preserved and running**. No unrelated application was reconfigured or restarted.

## Reproducible deployed artifact

| Item | Recorded value |
| --- | --- |
| Application | sporthost-production / oUctLiT_1JGDfDXbDDlwL |
| Latest deployment | E2uD2s-MiREQffR5-NWXn, status done |
| Source | Reviewed worktree ZIP based on Git 429f162; 92 runtime files, secret scan passed |
| ZIP SHA256 | ab126b72b6839e2fe09788f9cb6338d363536e23261d120356d6c090b2b5256a |
| Built image ID | sha256:016d70ba622d0e63b6006459c4b698e4d52049e76c082cd010c79499945d40c9 |
| Source integration | Native Dokploy drop deployment; auto-deploy disabled; no Git push or webhook configured |

The private immutable ZIP and operation evidence are under gitignored .vercel/dokploy/. Source changes remain reviewable in the worktree and have not been committed/pushed to Vercel's branch. The image ID is a local Docker image identity, not a claimed published registry digest.

## Test evidence

| Check | Result |
| --- | --- |
| Python 3.12 full regression | **135 passed, 11 skipped**, 93.40 seconds; synthetic local data |
| Subsequent runtime/config/GET smoke-helper subset | **26 passed**, 11.31 seconds; overlaps full suite, do not add counts |
| Prior synthetic browser suite | **10 passed**; local Uvicorn smoke 8/8; private local upload survived separate-process restart |
| Fresh native backup -> local restore -> 0011 -> old/current read probes | **Passed**, all original row hashes preserved; local PostgreSQL process stopped |
| Approved production upgrade | **0011**, 21 business tables unchanged |
| Actual Docker build / two Dokploy deployment events | **Passed**, current container healthy |
| Temporary-domain anonymous external preview | **9/9 GET checks passed** |
| Container-to-existing-DB readiness / read-only sessions | **Passed**; no write connectivity test |
| Existing applications | **8/8 preserved** |
| Production apex/www HTTP redirect | **301 to HTTPS** through existing Traefik |
| Public production TLS / final cutover | **Pending approved DNS**, certificate not valid yet |
| Resend real delivery | **Not performed**, key missing and EMAIL_ENABLED=false |

Private evidence includes final-regression-20261103.xml, preview-checks-20261103.xml, production-migration-result.private.json, final-container-inspection.private.json, deployment-all-status.private.json, temporary-url-smoke.private.json, other-apps-preserved.private.json and production-tls-pre-dns.private.json. Evidence captures point-in-time results; it does not establish production load capacity or a configured alert/backup schedule.

## Sprint and acceptance status

| Plan sprint | Outcome / remaining acceptance |
| --- | --- |
| 0 Audit | Source/VPS/platform/data/store/DNS audited; owner confirmed production DB; current Vercel SHA and full DNS zone export unavailable |
| 1 Production code | Implemented, tested, actual Docker build passed; local durable-upload test passed |
| 2 Staging | Dedicated staging waived by owner; same production app temporary domain, DB-enforced read-only preview passed |
| 3 Production preparation | App deployed healthy, existing storage/DB retained, approved 0011 applied, domain routing prepared |
| 4 Resend | Adapter/disabled behavior/tests/guide ready; dashboard verification/key/delivery pending |
| 5 UAT/security/backup | Synthetic feature/browser tests, native restore, real GET preview pass; production write UAT intentionally excluded by owner; HTTPS/load observation pending |
| 6 DNS/rollback | Concrete destination/change sheet saved privately; no DNS approval/change, final certificate and public-domain acceptance pending |
| 7 Operations | Manual source deployment and runbook ready; Git webhook, scheduled off-site backups, monitoring/alerts and retention ownership not configured |

Migration 0011 adds three club fee columns and changes the server default of monthly_policy. It preserves existing values. The documented old ORM explicitly supplies EXEMPT_PAID; external/raw SQL writers omitting the field would see the new SESSION_FEE default. No external writer inventory is available. See [backup/compatibility](BACKUP_AND_COMPATIBILITY.md).

## Exact remaining owner actions

1. Export/confirm the authoritative DNS zone and rollback records. Review the concrete destination in private .vercel/dokploy/dns-cutover.private.json; the VPS IPv4 was cross-checked against SSH target resolution and Dokploy's generated host, not guessed.
2. Approve website DNS/TTL cutover and the activation point for APP_READ_ONLY=false. After DNS, verify valid apex/www certificates and external GET checks before normal write activation. No production write-based test is included. Vercel stays live; retirement needs separate approval.
3. Optionally supply a scoped Resend key in Dokploy, exact domain verification and an approved recipient before enabling/test delivery. Missing email does not block DNS preparation, but reset/verification email remains unavailable.
4. Choose backup/monitoring retention ownership and a future Git deployment branch/webhook if desired. Manual ZIP deployment already works; Git integration is not a blocker to the current app.

Details: [manual actions](MANUAL_ACTIONS.md), [runbook](DOKPLOY_RUNBOOK.md), [DNS/rollback](DNS_CUTOVER.md), [acceptance checklist](UAT_CHECKLIST.md).

An earlier localhost SSH port-forward launch was rejected by automatic approval review with blocked by policy; no tunnel was started. Authorized SSH exec calls to Dokploy's localhost API subsequently completed the setup without a tunnel or changes to Docker/sudo permissions.
