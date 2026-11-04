# Retired source and active maintenance surface

On 2026-11-04, after the Next.js and member releases passed production acceptance, the owner requested removal of code that was no longer needed.

## Removed

- The Python web application, Jinja templates, old static JavaScript/CSS, Python route/browser tests and Alembic implementation files.
- The root Python Dockerfile/entry point, old Vercel runtime configuration and obsolete environment examples and dependency locks. Docker builds now explicitly use the single application in `v2/`.
- One-time migration/audit/deployment probes and scripts that imported the retired Python application. Sprint 0 reports and the independent 89-route CSV remain historical evidence.
- Unused TanStack Query, Drizzle Kit and tsx direct dependencies, the introspection configuration/generated draft, and the obsolete package override. Drizzle ORM remains the application's database layer.
- Unused TypeScript imports/bindings. `noUnusedLocals` and `noUnusedParameters` now prevent their return.
- The unused Blob-backup branch. Current backups require the verified Dokploy-volume manifest, paired with the same direct database endpoint.

The reviewed removal list contains 133 files, including 78 Python files. Working-tree source was snapshotted before removal, including uncommitted edits; those private archives stay ignored under `.vercel/cleanup/`. Production records, upload volumes, credentials, database schema, DNS and immutable rollback releases were not deleted.

## Preserved compatibility and tests

Compatibility code in `src/server/compatibility/`, existing fixed-price behavior and legacy form routes are active product functionality, not dead code. The same applies to schema exports enumerated by readiness checks even when SQL operations use table names directly.

Before deleting the Python oracle, synthetic billing results were captured independently from it. `v2/tests/fixtures/legacy-billing.json` retains canonical JSON/fingerprints, exact remainder allocation, balances and the legacy-written receipt shape, with source hashes for provenance. Integration tests compare the current service with that fixture and insert the captured receipt shape into a guarded disposable database, including duplicate delivery. Password/session fixtures remain independently captured as well. Application tests no longer spawn Python.

`v2/tests/fixtures/clubhost-baseline.sql` is a schema-only export of the reviewed 22-table baseline plus its revision marker. It contains no business/account rows. The explicit Node command `npm run db:test:prepare` accepts only a loopback `*_test` database, initializes only an empty schema and separately applies the reviewed member-link addition. Existing data is never reset by this command.

SMTP tests generate a short-lived localhost-only certificate with OpenSSL 3+ and run a local STARTTLS sink. They do not contact a real recipient or require a Python certificate generator.

## Operator tooling that remains necessary

Six optional Python operator commands remain in `scripts/`, isolated from the Node application and its tests:

| Command | Purpose |
| --- | --- |
| `backup_dokploy_source.py` | Read-only native PostgreSQL archive paired with a verified volume inventory |
| `backup_nextjs_media.py` | Private, binary-safe and hash-checked VPS image export |
| `verify_dokploy_backup.py` | Restore in a temporary local PostgreSQL process and optionally run Node regression on the copy |
| `apply_nextjs_member_schema.py` | Inspect or explicitly apply the reviewed additive member table |
| `dokploy_api_ssh.py` | Scoped Dokploy access through SSH with safe response fields |
| `check_nextjs_http_evidence.py` | Redacted route evidence from private browser reports |

Their separate requirements are in `scripts/requirements.txt`; none imports application models, FastAPI, Alembic or a Blob SDK. `scripts/__init__.py` declares their Python package. Removing these operational tools would discard backup/recovery and deployment controls still in use.

For a restore drill, invoke `python -m scripts.verify_dokploy_backup` with `--backup-dir`, `--pg-bin`, a new private `--work-dir` and optionally `--run-tests`. The target is always a newly initialized loopback process; no production URL is accepted. Original business rows are checked after regression, with only expired operational rate counters allowed to disappear.

## Validation

After retirement, all 188 Vitest cases and strict TypeScript checks pass. A restored production copy also passes the Node suite while preserving original business/auth/audit rows. Empty-schema Node bootstrap, standalone build, browser regression and deployment verification are recorded in `PROGRESS.md` when complete. Earlier reports describing a live Python oracle or Python fallback source in the working tree describe the pre-cleanup releases; rollback now uses retained immutable archives/images.
