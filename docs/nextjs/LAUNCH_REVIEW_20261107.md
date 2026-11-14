# Host/member launch review — 2026-11-07

This review extends [the previous product review](LAUNCH_REVIEW.md) and [release preparation](LAUNCH_RELEASE.md). Current source remains the full-stack Next.js application in `v2/`, deployed through the existing Dokploy applications.

## Product decisions

The core host workflow already covers club setup, scoped cohosts, fixed/guest members, recurring sessions, manual/automatic approval, whole-group capacity and waitlists, attendance, fee issuance, proof review, actual receipts, adjustments/refunds, retained debt and exports. The member workflow already covers verified accounts, owner-approved profile linkage, open-session registration, invitations/RSVP, permitted group edits/cancellation, monthly/session payments, private proofs and password recovery.

The following gaps were addressed before release:

| Audience | Gap | Result |
| --- | --- | --- |
| Host | Sharing required opening/copying the public page manually. | Public-link copy and native sharing on the session page, with a selectable full URL when clipboard permission is unavailable. Private attendance/payment links are never used for public sharing. |
| Member/guest | A host's registration rejection/cancellation reason was stored but absent from their booking page. Pending/waitlisted states needed clearer instructions. | The authorized player sees the host note and a status explanation. Pending/waitlisted registrations explicitly have no confirmed seat. Rejection remains enforced by the existing mutation rules. |
| Member/guest | Directions, maps, deadlines and participation policies were difficult to find from personal bookings. | Open-session cards and personal booking pages show these details. Booked cancellation terms/deadlines use the accepted snapshot; times explicitly use Vietnam UTC+7. Unsafe legacy map URLs are omitted. |
| Host and confirmed players | No portable personal-calendar download. | Authorized `.ics` downloads with UTF-8 folding, escaped text, UTC dates converted from Vietnam time, and stable session identifiers. Player downloads require a confirmed registration and an uncancelled session. Host exports require ordinary club view access. |

Calendar files contain session information and the public registration URL only. They exclude contacts, roster, bank details, fees and bearer links. They are one-time imports, not a subscription or automatic reminder service; the UI states that users must check SportHost for changes. No end time is invented because the application does not store one.

## Deferred improvements

These are follow-up work rather than missing core launch flows:

- Reliable registration-change/session reminders, backed by a durable delivery queue and retry/deduplication, with user notification preferences.
- Owner-reviewed self-service club join requests to reduce manual account linkage, retaining explicit identity approval.
- Bulk member import and richer host summaries as usage grows; existing member entry, finance and CSV export cover initial operation.
- Additional sports/event discovery and native mobile delivery after the initial host/member workflow has real usage.

## Verification

- Local unit tests: **157/157**, including calendar authorization/serialization and server-rendered player information.
- Full frozen-source unit/integration suite on disposable loopback PostgreSQL 18: **231/231**, 21 suites, zero skips.
- TypeScript and production build passed; standalone artifact scan excluded environment files, private keys, test outputs and Python.
- Initial Windows integration attempts through a long-distance SSH tunnel timed out; those runs were stopped and are not counted as acceptance. The full suite then passed beside the disposable database without changing timeouts or skipping cases.
- Browser acceptance extends the existing desktop/mobile suite with clipboard fallback, host/member/guest calendar downloads, pending/rejected restrictions, host rejection notes, venue/maps, revoked guest links and check-in-only cohost privacy/revocation. All **28/28** desktop/mobile cases passed against the deployed preview. The first run exposed a test synchronization race: the member page reloaded before the host server action completed even though the rejection and reason were committed. Waiting for the host's rendered `Đã từ chối` state made both affected cases deterministic.

The Vitest include pattern now accepts `.test.tsx` as well as `.test.ts`; otherwise the new server-rendered component cases would not execute. The restore run also exposed a pre-existing race in the lock-observation test: its open transaction reused the first `pg_stat_activity` snapshot. The poll now calls `pg_stat_clear_snapshot()` before observing the real lock, following [PostgreSQL's documented statistics semantics](https://www.postgresql.org/docs/18/monitoring-stats.html). The actual lock and gender-quota assertions remain intact.

## Frozen release and recovery

Candidate: private `.vercel/nextjs/launch-20261107/candidate-3/`, 226 inventoried source/reference files. Inventory SHA-256: `27f7c0ac33d08d63b798d532d0618b15502b3599dfb153a6bd6a7e8e39bc92af`. Deployment ZIP SHA-256: `46f66702544e80f0bbe51463f9bc69ff0d2ac787dd1f7b935b9a1f93200223be`.

Fresh native production database/media backups and original private Dokploy configuration are retained both on the VPS and privately in the local release directory. A restore into a new isolated PostgreSQL 18 database matched all **23 original tables / 13 rows** and the one referenced media asset by size/SHA-256. The reviewed additive payment migration was first applied to that copy without changing the legacy revision. Production's previous runtime image is retained as `sporthost-rollback:launch-20261107-production`; preview's previous runtime image is retained separately.

Production payment activation applied `0002_payos_orders.sql`, installed the three private runtime payOS values, and registered `https://sporthost.online/api/webhooks/payos`; payOS returned HTTP 200, provider code `00`, and the matching webhook URL. A real provider settlement must still be checked separately; neither webhook registration, a passing provider test double nor a return URL proves receipt of real money. Production smoke checks did not create synthetic customer or financial records.

## Deployment result

Preview deployment `HQIFvl6u4UU3xinTwcWibb` completed on the frozen candidate and ran image `sha256:8f0ceafb56f54f41c1565f4c8618ee4de18a272bb9f09e13bd1d456d35c52d12`. It was healthy as UID/GID `10001:10001`, exposed no direct host ports, matched the Dokploy runtime configuration, returned 200 from `/health`, `/ready`, `/me/login` and `/`, and preserved all 24 existing preview tables / 3,249 rows before browser acceptance.

Production deployment `cw0DqARiD5f6rS1umm5tkk` completed with the same image. One healthy container is running as UID/GID `10001:10001`, with no direct host ports and all three payment settings present. The additive migration preserved all **23 original tables / 13 rows** exactly and added only `payment_orders`; the legacy migration revision remains unchanged. Public smoke checks returned 200 for `/health`, `/ready`, `/me/login` and `/`, while anonymous subscription access returned 401. The release is live at `https://sporthost.online`.
