# Launch release preparation — 2026-11-05

The host/member application acceptance is recorded in [LAUNCH_REVIEW.md](LAUNCH_REVIEW.md). This record follows the frozen candidate into deployment checks. Production still serves the previous member-portal release; a passing local test is not evidence of live payment settlement.

## Frozen candidate

Private immutable directory: `.vercel/nextjs/launch-release-20261105/candidate/`.

| Item | Identity |
| --- | --- |
| Application source files | 214 |
| Source inventory SHA-256 | `bd8de45c8a8303a1d4a7a4bbef450291c6ffa0cfbdc7ac93b28a39f61a4c8661` |
| `sporthost-nextjs.zip` SHA-256 | `1387253f29fe169f05726420134f2548c1b52cf217be2eceea3fd8225f21937a` |

`scripts/prepare_nextjs_release.py` captures application source from tracked and untracked nonignored files under `v2`, rejects private/generated files, creates a deterministic ZIP and a frozen review copy, and records every file's bytes/hash. Verification compares current source, frozen source, archive inventory/CRC and archive hash. Use a new output directory for changed source; never overwrite a release candidate. This archive contains neither runtime credentials nor upload data.

```powershell
python scripts/prepare_nextjs_release.py --verify .vercel/nextjs/launch-release-20261105/candidate
node scripts/check_nextjs_release.mjs --target production
node scripts/check_nextjs_release.mjs --target preview
```

The Node checker uses the existing authorized SSH/Dokploy API and an explicit read-only database transaction. It checks payment columns, types, defaults, constraints, valid/ready indexes, runtime privileges, key presence, media mount, one running container and safe HTTP endpoints. It requires a completed deployment and checks both saved configuration and the actual container environment, so pending key changes cannot pass. Exit code 2 indicates unmet prerequisites. Reports expose presence/metadata only, never URLs with credentials, environment values, cookies or provider bodies. `preflight_passed` never implies a real settlement has occurred.

## Fresh production backup and restore

Before preview activation, production returned HTTP 200 on `/health`, `/ready` and `/me/login`, retained its persistent private uploads, and had one running container. It has no `payment_orders` table and none of the three payOS runtime keys. These are prerequisites for the candidate, not failures of its currently deployed older application.

Current production configuration was retained privately for rollback. The fresh database/media backup under `.vercel/nextjs/launch-release-20261105/production-backup/` contains 23 tables and 13 rows at legacy revision `0011_fixed_member_fees`, plus one 1,774,381-byte private image. Database export used TLS and a read-only consistent snapshot. Database and media source fingerprints match. Asset size/SHA-256, native archive readability and media ZIP contents were verified.

Dokploy's [container-file reader](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/services/docker.ts) truncates large files at 512 KiB. `backup_nextjs_media.py --host-session-file ...` now supports an optional fallback through the existing host's normal authenticated image route. It refuses redirects, external/unmapped routes, unauthorized/expired sessions and any length/hash mismatch. It never creates a session or weakens application authorization. Historical images with no accessible route still require a complete volume backup; they cannot be silently skipped. The current QR was downloaded completely using the retained owner session and matched its database hash.

The backup was restored into a fresh local PostgreSQL process, both reviewed additive migrations were applied, and the full application regression suite passed. All original business rows and the legacy revision were unchanged; one expired operational rate counter was pruned by the existing cleanup policy. The local restore process was stopped afterward. Production was not migrated, restarted or written to.

Private evidence:

- `production-preflight.json`, `preview-preflight.json`: initial read-only checks.
- `production-media-v2/manifest.private.json`: complete image inventory and checksums.
- `production-backup/manifest.private.json`: consistent database/media backup.
- `production-restore/verification.json`: successful restore, migrations and regressions.
- `production-preservation.json`: final read-only comparison; all 23 original tables still match the fresh backup.
- `production-rollback-config.private.json`, `preview-rollback-config.private.json`: retained pre-release configuration, never commit or print.

## Preview and remaining activation

The isolated preview database `sporthost_v2_preview_c2905007` was backed up before adding `0002_payos_orders.sql`. All 23 existing tables retained their row hashes; the legacy revision was unchanged. The restricted preview role received SELECT/INSERT/UPDATE on the new table only. Existing local payOS credentials were configured privately on the preview application, without changing any provider webhook or creating a live payment request.

The exact frozen ZIP was submitted to the existing preview application through the documented [Dokploy upload endpoint](https://docs.dokploy.com/docs/api/application#application-drop-deployment). Production configuration, image, domain and volume were not changed.

Preview deployment `gY8o9nmWOcbyAcblDQA9c` completed with runtime image `sha256:ee70ce8971340c383cedb358988312a38391810fcd9296e9b9a4c1d151748cbd`. Its read-only preflight passed: the physical payment schema and privileges match, configured/runtime keys and flags agree, the persistent upload volume is present, and `/health`, `/ready`, `/me/login` return 200.

The full HTTPS desktop/mobile browser suite passed **28/28**, with no retries or skips, in 11.5 minutes. This includes the complete host/member registration, approval, proof rejection/retry, payment recording and password-recovery flow, plus trial/Pro, cohost privacy, 15-player partial receipts/refunds/debt, recurrence, monthly dues, legacy URLs and private images. Browser fixtures use the isolated preview database; they never send real email, create payOS orders or perform real settlement. Screenshots and the passing runner record are retained under `v2/test-results/launch-preview-20261105/`; sanitized deployment/acceptance reports are under `.vercel/nextjs/launch-release-20261105/`.

Final read-only production checks still show the member-portal image `sha256:f7289cbd43a1f583315eeb467f2973ade103e3b92245cbe60530296ff7b82681`, healthy endpoints, unchanged original row hashes, no payment table and no payOS runtime keys. This candidate has not been deployed to production. No live payment settlement is claimed.

Before production activation, refresh the read-only checks and backup if current data has changed; apply the same reviewed payment migration, configure runtime keys and deploy the same verified candidate to the existing application/port. Keep current database, signing key, SMTP and media. Retain the previous compatible image/config for rollback; do not drop the additive table or restore an older dump over new transactions.

Register `https://sporthost.online/api/webhooks/payos` on the intended payOS channel only after the endpoint is deployed. A controlled real checkout/payment is still required to verify settlement, one ledger entry and one Pro extension. The read-only credential probe returned payOS missing-order code `101`, confirming the recovery contract; it created no order, link or financial transaction. Full setup and reconciliation rules are in [PAYMENTS.md](PAYMENTS.md).

## Operator verification

The additional operator checks passed: 7 source-packaging tests, 7 authenticated-media backup tests and 5 physical payment-schema inspection tests (19 total). Run the Python cases using the separate operator environment and the Node cases against the disposable loopback `*_test` database:

```powershell
python -m unittest scripts.tests.test_prepare_nextjs_release scripts.tests.test_backup_nextjs_media
node --test scripts/tests/check_nextjs_release.test.mjs
```
