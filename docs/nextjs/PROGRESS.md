# SportHost v2 release evidence

SportHost v2 is live at <https://sporthost.online> on 2026-11-04. The existing Dokploy production Application now runs one full-stack Next.js application with normal writes enabled, the original PostgreSQL `clubhost` schema and signing key, private VPS uploads and SMTP. Its runtime contains Node, not Python/FastAPI. No destructive database migration or agent DNS edit was performed.

Sprint 0 was completed before feature rewriting; its independent route contract and architecture, compatibility and acceptance references remain in `sprint-0/`. Completed inventory/audit/migration reports were privately archived and removed during cleanup. Current implementation is in `v2/`; completed HTTP evidence is recorded separately below.

## Current release: member portal, 2026-11-04

The member area is live at <https://sporthost.online/me>, with signup/login, verified email plus owner-approved member linkage, a personal overview, upcoming/history views, scoped session/monthly payments, QR/proof uploads and profile/password management. Existing guest links continue to work. See `MEMBER_PORTAL.md` for onboarding and the security model.

188 Vitest cases, typecheck/build and all 24 desktop/mobile Playwright cases pass locally; all 24 browser cases also pass on the isolated preview without retries in the final runs. Updated HTTP evidence still covers all 89 original contracts, including two intentional email-disabled 503 cases. A fresh production backup was restored and the additive migration plus regression passed on the copy. The new table adds four link columns without changing any legacy table or Alembic revision. Readiness now checks 245 columns in total.

Production deployment `UFyCxKLQvVbUZPMF9Rbha` completed on the same image as preview `i0SguO2Ch-iV8ZsBsjigN`: `sha256:f7289cbd43a1f583315eeb467f2973ade103e3b92245cbe60530296ff7b82681`. Source digest `a58ecd52cf87d23917a1df066d73386f01b3c9f2c55d5a502d8858378a8e67fd`; ZIP SHA256 `d755377355728acbed0673af6ab9ae218ebd5f4c47f89eb73991bfe58d88f1b8`. Current production has 23 tables. Post-release acceptance passed 36 HTTP/static/auth checks and 13 browser GET checks; all original 22 table hashes still match the fresh backup. SMTP, private media, normal writes and the original account remain intact. The previous Node image/source and private configuration are retained for rollback; leave the additive table in place during rollback.

## Cleanup candidate and documentation retirement: 2026-11-04

Code cleanup retired 133 files, including 78 Python files, and removed the unused TanStack Query, Drizzle Kit and tsx direct dependencies. The app and test suite run without Python; six optional backup/recovery/deployment operator commands remain outside the image. Independent captured auth/billing fixtures and the legacy route contract remain. See `CLEANUP.md` for the retained maintenance surface.

The cleanup candidate passed 188 Vitest cases, strict typecheck, standalone build/artifact scan, fresh local Node database bootstrap, a fresh production-backup restore/regression and 24/24 desktop/mobile browser cases in each of local and isolated preview, with no failures, skips or retries. Both HTTP evidence CSVs cover 89 contracts. The fresh 23-table production backup has SHA256 `5849dc7d47fcf64e8952b42ee2472e4342ea29477928ebcbe1e10a933ecb8fa0`; restored original rows were preserved.

Preview deployment `8BAyT-SgtbeDyBesr8nfi` completed with image `sha256:8e01b2d50ad1a6093913b4a9759c677ec7a4824bd0a42a83eeed6953df348698`. Source digest `b6cf4878666125a1051abaafd14a25032f905f30fca0e04bcb500bfc151b8b12`; ZIP SHA256 `ddcdc96bdeab4da84c05c0a0355a5e44e3ce56fe81b4a6af8a6faaae5294c595`. This candidate has **not** replaced production: concurrent payOS work changed application source after preview, so the exact-source deployment guard refused to proceed. Those local changes were preserved. Production remains on the member image above; current read-only HTTPS checks for `/health`, `/ready` and `/me/login` pass. No cleanup schema, DNS, production environment or mount change was made.

The additional owner-requested documentation/local cleanup removed 32 obsolete Markdown reports/plans, the generated historical inventory JSON, a duplicate root `.env.local` and two generated localhost SMTP certificate files. All 36 files were archived privately first. `.env.dokploy.local` and `v2/.env.local` remain intact; test certificates regenerate automatically. Recovery archive integrity, removals and all surviving documentation links were verified. Active setup/release/member/agent/design and compatibility references remain. Private evidence and recovery material are under `.vercel/cleanup/`.

On 2026-11-05 the owner explicitly confirmed repository cleanup only, preserving concurrent payOS work. The cleanup task is complete without production deployment. The final pass privately archived and removed 11 unreferenced legacy UX screenshots and the obsolete offline 0011 SQL review. Current application/package/migration files, payment/launch documentation and active env configuration were checked for byte-for-byte preservation across that pass. Earlier 188-case/24-case results above describe the accepted cleanup candidate; they do not certify subsequent payOS or launch changes. Future deployment belongs to that work's release process.

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
