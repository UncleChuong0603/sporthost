# SportHost v2 release and rollback

This procedure was executed on 2026-11-04; production now serves Next.js with normal writes enabled. Follow `PROGRESS.md` for test and preservation evidence. No destructive schema migration or DNS change was required for the reviewed 0011 database.

## Fixed identities

| Resource | Identity |
| --- | --- |
| Existing production Application | `oUctLiT_1JGDfDXbDDlwL`, `sporthost-production` |
| Isolated preview Application | `jDjFowxqtg40YPaQ8y_NA`, `sporthost-v2-preview-bwtxar` |
| Apex domain | `https://sporthost.online`, existing Dokploy domain forwards to port 8000 |
| Existing physical database | PostgreSQL schema `clubhost`, Alembic `0011_fixed_member_fees`; original URL and signing key remain private |
| Original fallback source | `.vercel/dokploy/sporthost-source-ab126b72b6839e2fe09788f9cb6338d363536e23261d120356d6c090b2b5256a.zip`; verify recorded image/config before use |

## Before activation

1. Require passing Vitest, typecheck, standalone build/artifact scan, all desktop/mobile Playwright cases and route evidence on the exact candidate source digest. Preview uses its own PG role/database, media volume and test accounts. Never run mutation suites on production.
2. Save current production environment/config, domains, source/image/deployment identities privately. Retain original Docker image/source and Blob store. Fetch fresh native DB/media backup with hashes and restore into another local test database; verify financial/auth/history rows and unrelated schemas.
3. Test static GET/HEAD compatibility routing for the historical Vercel hostname, preserving path/query. Unsafe requests must not reach its old writer during transition. Keep its immutable original deployment available; do not delete the project or media.
4. Reconcile stored assets and QR references, including bank/payment snapshots and tombstones. Copy identical keys/bytes to the production volume and hash every file. A zero-object backup does not waive objects uploaded subsequently.
5. Confirm SMTP privately in Dokploy and controlled delivery, or record the owner's explicit temporary mail-unavailable decision. Never send test messages to arbitrary users or log env values, password hashes, cookies or capabilities.

## Activation

1. Freeze/drain legacy writers. Existing Dokploy v1 is already read-only; separately account for historical Vercel and external writers. Refresh the data/media baseline after draining.
2. Add a dedicated production named volume at `/data/uploads`, UID/GID 10001. Deploy the verified v2 archive to the existing production Application. Keep `PORT=8000` so existing domain routing is unchanged. Use the original database/schema/signing key, production HTTPS origin, explicit hosts, secure cookies, bounded pool, private volume and initially `APP_READ_ONLY=true`. No startup migrations; target runtime has no Blob/Python requirement.
3. Verify healthy Node container/image, UID 10001, writable persistent mount, no public port binding and CPU/memory limits. Check trusted HTTPS, CSS, auth pages, safe unauthorized responses, original public guest URLs and no read-side data changes. Do not restart shared Traefik or unrelated services.
4. Move the historical hostname to the verified static compatibility artifact and prove synthetic path/query preservation. Retain its immutable original deployment. Do not forward old form POSTs across origins; users reload the new site for a current session/CSRF token.
5. Enable one normal writer only after checks pass. Use GET/read-only production smoke and safe logs/resources. Never create synthetic production clubs, bookings or financial transactions.

## Rollback

Freeze writes first. Retain transactions since activation; never restore an earlier DB dump over them. Restore the original compatible image/source and private environment on the same Application/port. Keep the v2 upload volume mounted and use the tested legacy `STORAGE_BACKEND=local`, `STORAGE_ROOT=/data/uploads` adapter so new v2 receipts remain accessible. Recheck signing key, schema, readiness and private files before writes.

A Blob-only fallback instead requires every new v2 file copied into its private store and verified before enabling it. Traffic rollback without those files is incomplete. Keep DNS/email records unchanged. Back up DB and private media independently; Docker images contain neither.

Initial observation is proposed at 48 hours. Record retention/alerts/off-server schedules as configured before claiming automation. Never prune the shared Docker host. Historical Python source/tests and Alembic remain archival/operator tooling, outside the v2 runtime.

## Execution record: 2026-11-04

- Completed fresh database/media backup and restoration, 176 regression cases on the restored production copy, a rich preview restore including 36 images, all 20 browser scenarios per environment and HTTP evidence for all 89 audited contracts. Preview needed two explicit case reruns; see `PROGRESS.md`.
- Retained original image `sha256:016d70ba622d0e63b6006459c4b698e4d52049e76c082cd010c79499945d40c9`, source ZIP and original private environment/config. The stopped old Dokploy container and immutable Vercel deployment were not deleted.
- Deployed exact preview-tested image `sha256:6bba0eef6777dbe2c1809275be59be0f6daa7fcf23ac016aa7a2f9eb6a0db73f` to the existing Application with one named volume and `PORT=8000`. Read-only deployment `hlibndT7lLNn4rbTJqeRy` completed; all 24 row hashes matched the pre-cutover backup and authenticated GET smoke passed.
- An initial deployment attempt failed on duplicate mount configuration before replacing the healthy legacy container. The duplicate configuration entry was removed without deleting volume data; subsequent deployments use configured mounts from `application.one` for idempotency. `mounts.allNamedByApplicationId` describes realized Docker volumes and must not determine whether a not-yet-deployed mount is configured.
- Activated historical `sporthost.vercel.app` on static deployment `dpl_CmARTgTd4DGpKY98HU9u4uaZxkxn`; verified path/query preservation and unsafe-method rejection. No production DNS records were edited.
- Activated normal writes via deployment `KMHQOpIEt0s_o4KZ0nDrL`, completed, using the same tested runtime image. SMTP is enabled after a controlled message to the existing owner was accepted over verified TLS. Read-only GET checks do not send email or create production test records.
- The owner confirmed deleting the original club after activation at 20:43 Asia/Bangkok. Preserve that intentional deletion and its audit records; do not restore the older backup over current production.

Private execution evidence is in `.vercel/nextjs/production-release/`; backups are ignored under `.vercel/nextjs/`. These locations are not an off-server backup schedule. `scripts/backup_dokploy_source.py --volume-media-manifest ...` accepts a verified private inventory produced by `scripts/backup_nextjs_media.py`; both are operator tools outside the runtime. Keep database and media snapshots reconciled, with secrets in private env files rather than command arguments.

## Member portal release: 2026-11-04

Deployment `UFyCxKLQvVbUZPMF9Rbha` completed after 188 regression cases, a fresh production restore drill, 24/24 local browser cases and 24/24 preview cases. The runtime image is `sha256:f7289cbd43a1f583315eeb467f2973ade103e3b92245cbe60530296ff7b82681`; source/ZIP identities and onboarding are in `MEMBER_PORTAL.md`. Post-deployment HTTP, static asset, auth/privacy and desktop/mobile GET checks passed without production fixture writes. Existing environment, uploads, SMTP and domain routing were retained.

The only production DDL was reviewed `v2/migrations/0001_member_accounts.sql`: one additive link table/index, no legacy row updates and no Alembic revision change. Readiness requires it before deploying the member image. The previous full-stack Node image `sha256:6bba0eef6777dbe2c1809275be59be0f6daa7fcf23ac016aa7a2f9eb6a0db73f` ignores that extra table and remains a compatible rollback. Restore its retained source/image with the current environment and media volume; do not drop the link table or overwrite transactions with the older backup. Private current-release config, backup, restore and smoke evidence is in `.vercel/nextjs/member-release-20261104/`.

When pairing DB and volume backups, use the same direct database URL in both private env inputs. A pooled hostname and its direct hostname produce intentionally different source fingerprints; the verifier must not accept them as an unchecked identity match. The initial mismatch was rejected before any production writes, then both backups were re-created against the same direct endpoint and restored successfully.
