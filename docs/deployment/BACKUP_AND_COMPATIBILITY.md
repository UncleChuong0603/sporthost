# Native backup and approved 0010 -> 0011 migration

Updated 2026-11-03 (Asia/Bangkok). The owner confirmed the Neon database/schema clubhost from private .vercel/action-plan-production.env as production and explicitly approved migration 0011. **The production upgrade has now completed.** No production restore, destructive migration or write-based test was run. DNS remains unchanged.

## Data and storage identity

- Existing external **Neon PostgreSQL 18.6**, schema clubhost, client TLS verified. No new VPS PostgreSQL service/database/schema was provisioned.
- Fresh pre-migration snapshot: **22 tables, 24 rows**. Hosts 1, clubs 1, game_sessions 1, bookings 0, stored_assets 0, payment_proofs 0. These counts are snapshot observations, not a guarantee against future live user writes.
- Existing private Vercel Blob token successfully listed/backed up the application's clubs/ prefix: **zero objects**. Dokploy retains the same external store; no uploaded file was copied, removed or moved to a container layer. No upload volume is needed with Blob.
- Original signing key was recovered from existing private configuration and verified offline against a public live Vercel CSRF token. Masked values in older env exports were not used as credentials. No auth/verification/admin bypass was introduced.
- Current Vercel API auth still returns 403, so exact live source SHA is unknown. Production DB identity is owner-confirmed; it is no longer an unresolved prerequisite for the approved migration.

## Fresh pre-change backup and restore

Private backup: .vercel/dokploy/backups/source-20261103-approved/.

| Artifact | Verification |
| --- | --- |
| sporthost-schema.dump | Native custom archive, only clubhost; readable TOC and successful actual local restore |
| manifest.private.json | Original columns/counts/SHA256 for each table from a shared exported REPEATABLE READ snapshot |
| archive-toc.private.txt | Native inventory, retained privately |
| sporthost-media.zip | Complete app-prefix read/hash/ZIP integrity verified; zero objects |

Native dump SHA256: **d4f11ca256234f6c04c9c73550dd26807c48febb616869194b588d749557b263**.

Fresh restore result: .vercel/dokploy/restore-approved-20261103/verification.json. The dump was restored to a generated, password-protected PostgreSQL 18.6 process on local 127.0.0.1; all original columns/counts/hashes matched. Upgrade to 0011 preserved those hashes. Current source and documented old Vercel release **8ee0239** passed health/ready/login GET and Club SELECT probes against the upgraded local data using read-only connections. The local process was stopped afterward. No dedicated staging app or OS/VPS database service was created.

Earlier backup .vercel/dokploy/backups/source-20261102-single-production/ is retained as historical evidence (SHA256 980ddc0907cbcc61207a8a092d5d08b3a788040808b666f4db7764c9eda5a941). Its final old-release check is in restore-check-20261102-final-vercel/verification.json; an initial parent-release 77a8a2e check also passed. Historical manifests retain source-confirmation status recorded when they were created; subsequent owner confirmation is recorded separately.

All artifacts contain personal/authentication data and remain gitignored, outside the Docker build context. Backups are on the developer machine, off the VPS; scheduled encrypted remote retention/PITR has not been configured or certified. Refresh the backup before later approved data/schema changes or cutover if live writes have occurred.

Portable PostgreSQL 18.6 tools came from the EDB binary archive linked by PostgreSQL's official Windows download page; private source URL/hash is in .vercel/tools/pg18/source.json. No installer or Windows/VPS service was used.

## Approved production result

Private approval: .vercel/dokploy/production-migration-approval.private.json.
Private result: .vercel/dokploy/production-migration-result.private.json.

- Before: 0010_payment_config_snapshot; after: **0011_fixed_member_fees**.
- Fresh verified backup/restore completed before the change. Operator migration had lock_timeout 5 seconds and statement_timeout 30 seconds; no migration runs on application startup.
- All **21 business tables** retained the same original-column row counts/hashes immediately across the upgrade. Alembic version advanced as expected; new columns were verified by current ORM/readiness.
- Live Vercel health/ready remained 200. Its existing public session GET, which returned 500 before the schema update, returned 200 afterward. This is a read-compatibility observation, not production write UAT.
- No INSERT/UPDATE/DELETE test, account/login POST, upload, club/session edit, finance operation, fixture, cleanup or remote restore was used for verification.

## Migration behavior and compatibility limits

alembic/versions/0011_fixed_member_fees.py:

1. Adds clubs.fixed_fee INTEGER NOT NULL, server default 50000.
2. Adds nullable clubs.fixed_fee_male and clubs.fixed_fee_female.
3. Changes the server default of game_sessions.monthly_policy to SESSION_FEE.
4. Advances Alembic; does not recalculate/delete existing records. Destructive downgrade is deliberately refused.

Old 8ee0239 Club mapper ignores new fields; PostgreSQL supplies the non-null default for old inserts. Its GameSession mapper explicitly supplies **EXEMPT_PAID**, so that ORM path retains its behavior. Raw SQL/external writers omitting monthly_policy observe the new SESSION_FEE default; no external writer inventory is available. Local old/current source read compatibility passed, and live Vercel reads passed, but its current SHA and all external writers are not independently certified.

Dokploy remains **APP_READ_ONLY=true** before approved cutover: unsafe HTTP methods are blocked and every PostgreSQL connection sets default_transaction_read_only=on, protecting legacy GET handlers too. Do not downgrade schema or restore an old backup over later user transactions during traffic rollback. Keep Vercel and Blob available.

## Repeatable read-only backup / isolated verification

Use new unique directories; scripts refuse to overwrite existing artifacts:

```powershell
python -m scripts.backup_dokploy_source --env-file .vercel/action-plan-production.env --schema clubhost --pg-bin .vercel/tools/pg18/pgsql/bin --output-dir .vercel/dokploy/backups/NEW_UNIQUE_DIRECTORY
python -m scripts.verify_dokploy_backup --backup-dir PRIVATE_BACKUP_DIRECTORY --pg-bin .vercel/tools/pg18/pgsql/bin --work-dir .vercel/dokploy/NEW_UNIQUE_LOCAL_CHECK --vercel-commit 8ee0239
```

Backup is independent of ORM revision and uses one shared snapshot for native dump and manifest. Verifier accepts no remote restore URL and restores only into its local disposable process. Production recovery always needs a separate reviewed decision, especially after new transactions.
