# Sprint 0 validation

Date: 03/11/2026, Asia/Bangkok. Test results below are for the legacy working tree and audit probes, **not v2 feature parity**.

| Check | Actual result |
| --- | --- |
| `.venv\Scripts\python.exe -m pytest -q -ra` | **137 passed, 11 skipped**, 128.23 seconds. Temporary SQLite forced by conftest; no production DB/storage/email. |
| `SPORTHOST_BROWSER_TESTS=1` + pytest on all six `*_browser.py` files | **10 passed**, 68.50 seconds. Headless local Microsoft Edge/Playwright, isolated SQLite/upload paths. |
| Remaining default skip | `test_postgres_migrations` requires explicit disposable loopback `*_test`/`*_staging` PG URL and opt-in flag. Not run on production; must run on isolated PG before migration release. |
| `python -m scripts.check_nextjs_auth_compatibility` | 5 synthetic PBKDF2 passwords, 5 signed payloads, 20 invalid-token rejections, guest HMAC/digest match. Uses synthetic secret/fixtures only, no app import/database/env loading. |
| `python -m scripts.audit_nextjs_database --env-file PRIVATE_ENV --schema clubhost --output .vercel/nextjs/sprint-0/database-20261103.private.json` | Read-only snapshot successful after adapting pooler startup options; PostgreSQL 18.6/TLS, revision 0011, 22 physical tables, 241 columns, 292 constraints, 66 indexes, 20 sequences. |
| ORM vs physical column comparison | 21 ORM models; no missing or extra physical columns (relationship excluded, `_legacy_access_key` mapped to `access_key`). |
| Dokploy `application.one` read-only inspection | Existing `sporthost-production`, status done, Dockerfile build, one replica; no mutation/deploy. |
| Anonymous strict-TLS production checks | Vercel health/ready 200. Apex/www initially failed DNS/connection before owner DNS update; follow-up below. |
| Local tools | Node v22.15.0, npm 10.9.2 available; portable PostgreSQL 18 tools and Python environments already present. Docker CLI unavailable on local PATH; Linux image build needs existing Dokploy/authorized build environment. |

First DB audit refused masked DB_SCHEMA before any connection; explicit `--schema clubhost` now required. Second connection refused unsupported startup options at the existing pooler; corrected to supported read-only startup plus transaction-local timeouts. No writes, migrations or connectivity bypasses used.

Inventory regeneration/check:

```powershell
.\.venv\Scripts\python.exe -m scripts.audit_nextjs_sprint0
.\.venv\Scripts\python.exe -m scripts.audit_nextjs_sprint0 --check
.\.venv\Scripts\python.exe -m scripts.check_nextjs_auth_compatibility
```

Generator uses AST/file reads only; no application import, environment loading or database. JSON contains full syntactic call names and argument/mapping declarations; these are inspection aids, not proof of permission or locks. Physical catalog is separately inspected as above. Re-run manifest after audit tooling changes so its own hashes match.

## Verification limits and remaining release gates

- No fresh production dump/restore drill in Sprint 0; prior hosting drill is historical evidence only. Refresh before cutover, preserving every legacy-column hash plus private media SHA256.
- PostgreSQL migration and race tests must run on local/preview disposable PG; SQLite successes cannot establish locking behavior. Current production empty financial tables do not waive rich synthetic financial fixtures.
- Offline crypto feasibility decoder is not a hardened production auth module. Port with strict typed parsing, asynchronous password verification, size limits and security tests.
- No SMTP credentials or sender in inspected snapshot. No real account email sent; DNS screenshot does not prove SMTP connectivity or delivery.
- No Next feature implemented or deployed when closing S0. No production migration, DNS edit, write activation, role change or service replacement performed.
- A link's path can be preserved in v2 while an absolute `vercel.app` link still depends on the old host. Test both and keep fallback; do not claim URL compatibility solely from local route mapping.

## Owner DNS update

Owner supplied screenshot showing apex A record and email-related records and reported DNS added. No `www` record was shown. Immediate local resolver still reported no apex/www address. Authoritative launch1.spaceship.net and Cloudflare 1.1.1.1 subsequently returned apex A 42.96.4.79 (TTL 1800); www returned NXDOMAIN. A strict-TLS curl using --resolve to that apex address and the correct hostname failed certificate trust (SEC_E_UNTRUSTED_ROOT), so HTTPS acceptance remains pending. --resolve overrides DNS only; certificate validation was kept enabled. Check authoritative/public resolvers and retry during implementation; never mark release complete from the control-panel screenshot alone. No agent DNS edits were made.
