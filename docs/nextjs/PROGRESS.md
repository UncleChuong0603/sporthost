# SportHost v2 release evidence

SportHost v2 is live at <https://sporthost.online> on 2026-11-04. The existing Dokploy production Application now runs one full-stack Next.js application with normal writes enabled, the original PostgreSQL `clubhost` schema and signing key, private VPS uploads and SMTP. Its runtime contains Node, not Python/FastAPI. No destructive database migration or agent DNS edit was performed.

Sprint 0 was completed before feature rewriting; its historical audit and acceptance backlog remain in `sprint-0/`. Current implementation is in `v2/`. The route backlog is historical; completed HTTP evidence is recorded separately below.

## Current release: member portal, 2026-11-04

The member area is live at <https://sporthost.online/me>, with signup/login, verified email plus owner-approved member linkage, a personal overview, upcoming/history views, scoped session/monthly payments, QR/proof uploads and profile/password management. Existing guest links continue to work. See `MEMBER_PORTAL.md` for onboarding and the security model.

188 Vitest cases, typecheck/build and all 24 desktop/mobile Playwright cases pass locally; all 24 browser cases also pass on the isolated preview without retries in the final runs. Updated HTTP evidence still covers all 89 original contracts, including two intentional email-disabled 503 cases. A fresh production backup was restored and the additive migration plus regression passed on the copy. The new table adds four link columns without changing any legacy table or Alembic revision. Readiness now checks 245 columns in total.

Production deployment `UFyCxKLQvVbUZPMF9Rbha` completed on the same image as preview `i0SguO2Ch-iV8ZsBsjigN`: `sha256:f7289cbd43a1f583315eeb467f2973ade103e3b92245cbe60530296ff7b82681`. Source digest `a58ecd52cf87d23917a1df066d73386f01b3c9f2c55d5a502d8858378a8e67fd`; ZIP SHA256 `d755377355728acbed0673af6ab9ae218ebd5f4c47f89eb73991bfe58d88f1b8`. Current production has 23 tables. Post-release acceptance passed 36 HTTP/static/auth checks and 13 browser GET checks; all original 22 table hashes still match the fresh backup. SMTP, private media, normal writes and the original account remain intact. The previous Node image/source and private configuration are retained for rollback; leave the additive table in place during rollback.

The sections below retain the evidence and identities of the original full-stack cutover.

## Implementation

- A single App Router application with TypeScript business modules, Server Actions and Route Handlers; Tailwind/shadcn controls, Zod/React Hook Form, Drizzle mappings of all 241 existing `clubhost` columns. The standalone Docker target runs Node as UID/GID 10001 with a private persistent upload volume and no Python artifacts.
- Compatible PBKDF2 hashes and signed session/CSRF/guest links, durable one-use email tokens, account/club/member/cohost permissions and scoped read DTOs.
- One-off and recurring schedules, fixed invitations/RSVP, phone-first guest privacy, atomic whole-group capacity and gender quotas, waitlists, link rotation/revocation, lifecycle and versioned per-person attendance/replacement/walk-in.
- Exact integer-VND billing and Python-compatible fingerprints; monthly/gender fees including zero overrides; GROUP/SPLIT, immutable issued charges, append-only receipts/refunds/reversals, versioned adjustments, close with debt, independent platform ledger and compatible CSV exports.
- Bounded private image uploads, bank/QR snapshots, manual proof review, transaction rollback cleanup and a durable retry journal for failed post-deletion cleanup. Uploading a screenshot does not confirm payment.

## Verified on 2026-11-04

| Check | Evidence |
| --- | --- |
| TypeScript and PostgreSQL | 176 Vitest cases pass, including independent-connection races, failure injection, exact money reconciliation with the actual legacy Python oracle and a local STARTTLS SMTP sink. Typecheck passes. |
| Schema | All 241 columns, 292 constraints and 66 indexes match the observed baseline. Readiness verifies all mapped columns and revision `0011_fixed_member_fees`. Startup never migrates. |
| Production backup restore | Fresh pre-cutover archive SHA256 `b0fb82491ca025bfeef888aae097930fd3e24a3bf833228159625c2ed38c80cf` restored all 22 tables, 24 rows and 20 sequences into a fresh local test database. All 176 regressions passed, preserving business/auth/audit rows and an unrelated-schema sentinel. The 18 expired operational rate counters were pruned by the tested retention routine. Restore/regression made no production writes. |
| Browser scenarios | 20/20 local desktop/mobile scenarios pass. Preview covers the same 20: 18 passed in the combined run; two desktop cases interrupted/timed out during browser interaction passed when explicitly rerun against the unchanged candidate. Earlier failures remain in private reports. Flows cover accounts/passwords, group billing, native forms, 15-player proof/partial bank/cash/refund/close-with-debt, cohost privacy, recurrence/RSVP/monthly dues/deletion, admin ledger and legacy/current guest URL lifecycle. |
| Legacy HTTP contracts | All 89 audited route templates have local and preview evidence in `HTTP_EVIDENCE_LOCAL.csv` and `HTTP_EVIDENCE_PREVIEW.csv`. Server Action POSTs do not substitute for native legacy POSTs. Two email-disabled scenarios intentionally return 503; real SMTP transport is tested separately. |
| Linux runtime | Authorized isolated Dokploy preview built and ran the Node-only image, non-root, private volume, 512 MiB memory/one CPU, bounded PG pool, no public container port binding. HTTPS health/ready/login checks pass. |
| Media persistence/rollback | Rich preview backup restored 22 tables, 1,459 rows, 20 sequences and 36 private images, with hashes verified; all 176 regressions passed. Four images also survived an earlier rebuild. The legacy storage reader read exact v2-written bytes from restored storage. Original production backup contained no media objects. |
| Proxy trust | Preview probes with forged `X-Forwarded-For` and `X-Real-IP` counted the actual observed client twice and did not count forged identities. Trust is restricted to the verified private Traefik deployment with no direct public application port. |
| Production cutover | Trusted HTTPS, readiness, 14 static assets, original-owner compatible session and 15 GET checks passed before activation. All 24 original row hashes matched the backup. After activation, desktop/375px browser GET checks passed without unsafe requests or page errors. Apex resolves to `42.96.4.79`; `www.sporthost.online` currently has no resolvable A record and is not the published entry point. |

After activation the owner explicitly deleted the existing club at 20:43 Asia/Bangkok and confirmed that action in chat. Its member and game disappeared as part of that operation; the account is unchanged and deletion audit records remain. This is separate from the successful pre-activation preservation check. The backup remains intact; no automatic restoration overwrote the owner's action.

## Deployed identities

| Resource | Identity |
| --- | --- |
| Production | Application `oUctLiT_1JGDfDXbDDlwL`; activation deployment `KMHQOpIEt0s_o4KZ0nDrL`, completed; internal port 8000 preserves existing domain routing. |
| Preview | Application `jDjFowxqtg40YPaQ8y_NA`; deployment `SQhX8CEt8HYj92m2nDJmS`, completed; <https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io>. Separate database/role and volume; its role cannot read production. |
| Runtime image | `sha256:6bba0eef6777dbe2c1809275be59be0f6daa7fcf23ac016aa7a2f9eb6a0db73f` in both preview and production. |
| Source digest | `74d57abb4d17b2157ca68c2fb80a6c0f6141dea18a905f18859d08ecf823607b`; ZIP SHA256 `30006ffe57fe805aa3f38d51c1cbd08c47116ca223f384b8b6da97324c573822`. |
| Production media | Named volume `sporthost-v2-production-uploads`, mounted privately at `/data/uploads`. |
| Rich preview DB backup | SHA256 `7b46cc7948862e766aab6b74253be476fc1b2c7a2a0396a54eaf93dd342e9b1b`; 36 images separately hashed and restored. |

Historical <https://sporthost.vercel.app> now serves static compatibility deployment `dpl_CmARTgTd4DGpKY98HU9u4uaZxkxn` with no Python functions. GET/HEAD preserve paths and query strings through a 307 redirect to the apex; unsafe methods return 503 and request a reload on the new site. Synthetic join, attendance, dues and password-reset paths were verified. Original immutable deployments/images/source remain retained as rollback material.

SMTP is generic and replaceable. Production uses verified TLS to Resend SMTP with its restricted send-only key. One authorized message to the existing owner was accepted by SMTP; mailbox receipt is not independently confirmed. No provider SDK, paid authentication or storage dependency is required.

## Operations

See `RELEASE_RUNBOOK.md` for activation records and rollback without overwriting newer transactions. Backups and restore verification have been performed manually; scheduled off-server backups, alerting and automatic media-cleanup retries are not configured. Retain the fallback and observe the release for an initial 48 hours before considering cleanup. Credentials, account data, raw traces, backups and sessions remain outside tracked documentation.
