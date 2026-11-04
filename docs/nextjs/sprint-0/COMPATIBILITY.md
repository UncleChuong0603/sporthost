# Database, authentication and URL compatibility

## Physical PostgreSQL baseline

Read-only inspection at 2026-11-03 14:48 UTC (21:48 Asia/Bangkok) confirmed PostgreSQL 18.6, client TLS, schema `clubhost`, revision `0011_fixed_member_fees`. Catalog: **241 physical columns, 292 constraints (including PostgreSQL catalog not-null constraints), 66 indexes, 20 sequences**, 21 application tables + Alembic version. ORM physical field names match the catalog: no missing/extra columns. Preserve existing sequence ownership/defaults and ID values.

Live metadata is in gitignored `.vercel/nextjs/sprint-0/database-20261103.private.json`; it includes definitions and counts, not row exports or credentials. The generated ORM inventory is not authoritative for physical server defaults: many SQLAlchemy defaults run only in Python and must become explicit service defaults in TypeScript. Strings in PostgreSQL remain strings: snapshots/policy are VARCHAR JSON text; local session times and UTC audit/token times must not silently become timestamptz; nullable price overrides must remain nullable and zero must stay a valid override.

Map with Drizzle `pgSchema('clubhost')`, exact snake_case table/column names, existing FK/unique/check/index definitions and serial sequence defaults. The production libpq URL may begin `postgresql+psycopg://`; Node must normalize to `postgresql://` and deliberately map supported TLS/pool options. Reject masked credentials and unsafe schema identifiers. Do not change global `search_path` or use default `public` tables.

Drizzle adoption:

1. Restore a fresh, verified native backup into **isolated PostgreSQL**, preserve sequence/default/constraint data and media references, and verify legacy-column hashes. Prevent restore from executing unreviewed outside-schema changes.
2. Introspect the isolated schema with schema-filtered `drizzle-kit pull` and review definitions. [Drizzle pull documentation](https://orm.drizzle.team/docs/drizzle-kit-pull) describes database-first schema generation; pulling is not applying a migration.
3. Establish baseline metadata from the existing schema; never apply generated CREATE statements to existing `clubhost`. Keep `alembic_version` history as historical evidence. No `drizzle-kit push` or startup migration against production.
4. Future v2 schema changes use reviewed additive SQL and a dedicated journal confined to `clubhost`. Test exact SQL on clone; first verify the old Alembic operator rejects unknown tables, so freeze legacy migrations after ownership handoff. Runtime Python need not use Alembic for reads/writes, but its migration tooling may reject a new journal/table.
5. Before any production schema application: exact target identity, snapshot/restore evidence, SQL diff, lock/statement timeouts, current-row hashes/counts and rollback behavior must be concrete. No destructive operations authorized. New schema metadata changes must not touch accounts/history/other schemas.

No database migration was needed or executed for Sprint 0. Readiness must validate expected schema columns and permissions, not just `SELECT 1`.

## Passwords

Source `app/main.py:327`: 16-byte random salt, UTF-8 password, PBKDF2-HMAC-SHA256 **310000 iterations**, 32-byte derived key, `salt.hex():digest.hex()`. Current one host hash matches `^[0-9a-f]{32}:[0-9a-f]{64}$`; no production hash values were exported into reports.

Node verification: strict length/hex parsing, asynchronous `crypto.pbkdf2` (avoid blocking web event loop), 310000/32/SHA256, `timingSafeEqual` after equal buffer lengths. UTF-8 encoding without Unicode normalization. Existing passwords must not be restricted by JavaScript UTF-16 `.length` accidentally: Python counts Unicode code points, so use a code-point length policy for new input. Login can verify old values without applying a new strength policy retroactively. Rate-limit before expensive work and use equivalent work for nonexistent account paths to reduce account-enumeration/timing leakage.

Offline probe validated five synthetic passwords including Vietnamese, combining Unicode, 256 ASCII characters and astral characters; rejects wrong passwords. This proves algorithm feasibility, not implementation security. Continue using legacy format for new hashes during rollback window; optional rehash only after fallback compatibility is resolved. No account reset required.

## Sessions, CSRF and signed payloads

| Contract | Current behavior | v2 requirement |
| --- | --- | --- |
| `clubhost` | ItsDangerous URLSafeTimedSerializer salt `clubhost-session-v1`, `{id,v}` with missing v treated as 0; max age 14 days; HttpOnly/Secure/Lax | Validate signature + timestamp + typed payload + DB session_version on every protected entry; preserve cookie name/domain/path semantics and version revocation |
| `sporthost_booking_{public_id}` | Same serializer salt; `{booking,key}`; age 30 days | Prove booking/session/contact/key ownership before disclosure/reactivation; no cross-club reuse |
| Form CSRF | Salt `clubhost-csrf-v1`; `{session: full clubhost cookie or 'public'}`; age 6h | Bounded compatibility decoder and constant-time session binding; new mutation origin checks; never accept arbitrary unsigned tokens |
| Lookup review | Salt `sporthost-guest-review-v1`; `{game,phone,version}`; age 15m | Bind to session/normalized phone/profile+fee version; changing profile forces fresh confirmation; no PII in token payload beyond phone |
| Reset/verify | SHA256 raw random token in `email_tokens`, purpose, one-use, expiry ISO UTC | Preserve existing raw link lookup/purpose/expiry/used flag and locking; never consume via GET |

ItsDangerous 2.2 defaults verified from installed source: key derivation SHA1(`salt + 'signer' + SECRET_KEY`), HMAC-SHA1 signature over URL-safe payload + dot + unsigned big-endian timestamp, unpadded base64url. Compressed JSON is zlib and has a leading dot. Verify signature before decompressing, cap input and decompressed length, reject malformed timestamps and future/expired tokens. SHA1 here is the legacy keyed compatibility format; do not substitute SHA256 and silently invalidate links/cookies. New algorithms require versioned issuance plus proven legacy verification.

Offline Python → Node probe passed five payloads across the three salts, both compressed/uncompressed payloads, and 20 wrong-salt/tampered/expired/future rejections. It also proved the current guest HMAC and SHA256 digest. Probe is intentionally standalone audit tooling, not production code.

Cross-domain cookies from `sporthost.vercel.app` cannot transfer to `sporthost.online`; re-login on new hostname is expected and does not require a password reset. Exact deployed SECRET_KEY must be privately recovered and verified before existing guest capability tests; local masked snapshots are insufficient. No automatic key rotation.

## Guest capability URLs

Preserve GET/POST family `/join/{public_id}`, `/attend/{key}`, `/dues/pay/{key}` and image/proof/RSVP/cancel/edit/payer subpaths verbatim, plus `/verify-email?token=...` and `/reset-password?token=...`. Keep `source=facebook` behavior. [Route checklist](ROUTE_PARITY.csv) covers every method/path, including host/admin/exports.

Modern guest token = lowercase hex HMAC-SHA256(SECRET_KEY, UTF-8 `guest-booking-v2|` + nonce); stored digest = lowercase hex SHA256(raw token). Lookup accepts digest/current legacy digest and (where present) exact legacy plaintext, then checks revocation and actual expiry. Preserve current/legacy digests, nonce and expiry; do not mint new public IDs or reset access solely because code changed. Missing-token legacy normalization is a reviewed command, not a read side effect. Monthly due access keys are existing random strings and must remain valid; changing to digests is a later compatibility migration, not required here.

Absolute historical links on `sporthost.vercel.app` require that hostname to keep serving the old application or an explicitly tested compatibility redirect/service. Dokploy cannot take control of the Vercel-owned hostname. Do not retire Vercel compute until all supported old-host URL families work via an owner-reviewed mechanism; keeping Vercel during observation is already required. A compatibility redirect may only happen after verifying the target route/capability behavior, and must preserve path/query without exposing tokens to logs. Target v2 itself has no Python dependency; a retained legacy fallback is temporary migration infrastructure.

## Storage and email

Owner selected VPS persistent volume + SMTP. Do not remove Blob objects or alter production storage while v1 remains the writer. Before cutover freeze writes on both entrypoints, reconcile all `stored_assets` plus club/booking/due/batch snapshot QR references; download/copy bytes into the same key paths on v2 volume, verify SHA256, test private delivery/restart, preserve tombstoned size-zero media as 410. Keep original store and immutable backup; resume only one normal writer after handover.

Rollback after v2 creates new files must copy those exact new files to the fallback-accessible store **before** restoring traffic, or configure and verify a shared private storage adapter first. Never route writes back to Blob-only Python while new receipts exist solely on a v2 volume. A shared data volume mounted into fallback is another possible operator-reviewed option. This storage rollback test is a release gate, not a future suggestion.

SMTP is the chosen transport but no usable host/account/sender was present in the inspected snapshot. Supply privately to Dokploy; do not paste credentials into source/chat or assume DNS records prove account delivery. Domain records in the user's screenshot support email verification separately; DNS does not configure SMTP credentials. Controlled recipient acceptance is required before enabling production email; unavailable state remains truthful meanwhile.

## Rollback compatibility

Preserve legacy columns and meanings alongside issued charge/movement tables; new financial writes synchronize compatibility flags without double-counting. Run v2-created fixtures through old Python on the same isolated clone and prove reads plus relevant writes. Raw historical snapshots/hashes must survive unchanged. Roll back traffic/image, never automatically downgrade/drop/restore production DB over post-cutover transactions. Retain native backup, old image/source identity, original SECRET_KEY, original Blob, v2 volume backup and DNS zone export.
