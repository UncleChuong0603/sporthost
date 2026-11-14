# Excel exports and monthly-dues reminders

## Implemented flows

All exports are Free, authenticated, read-only `.xlsx` downloads. They use the existing records and permission checks, without creating charges or modifying payments. The download button reports progress/errors and restores keyboard focus on errors.

| Entry | Required permission | Contents |
| --- | --- | --- |
| Members → select club → Xuất thành viên Excel | Contacts visibility (owner, bookings or finance) | Selected club and current name/phone, kind and gender filters; name, phone, kind, gender, level |
| Session → Xuất điểm danh Excel | Check-in | Booking/attendance state, Vietnam session/arrival/departure times; no phone, finance or private capabilities |
| Session → Xuất thu chi buổi Excel | Finance | Summary, issued payer balances, immutable issued/draft calculation, costs, signed actual movements and attendance |
| Finance → select club/period/status → Xuất thu chi Excel | Finance | Filtered ledger totals and rows, outstanding rows, period-scoped credits (explicitly independent of status filter) |

Phone numbers are explicit text cells, preserving leading zeroes. Money is numeric integer VND; negative values remain numeric. User text beginning with `=`, `+`, `-` or `@` is stored as text, never a formula. XML control characters are removed. Headers freeze and empty reports retain headers. Up to 20,000 data rows across sheets are allowed; larger requests return a Vietnamese filter prompt. Existing CSV and calendar routes remain available. A legacy booking with no detailed participants appears with its member name and an explicit missing-detail label, without inventing attendance or companions. Downloads are private/no-store/noindex, rate-limited per account/client, and revalidate server permissions.

### Monthly reminders (Pro)

1. The owner opens Club → Nhắc việc, enables **Nhắc phí tháng chưa đóng**, chooses day 1–28 and spacing 1–14 days, then saves. Defaults are disabled/day 5/spacing 3 days.
2. Create real monthly dues through the existing Finance flow; reminders never create dues.
3. The player verifies their email and is explicitly linked to the correct member profile. In Notifications they separately enable **Nhận nhắc phí tháng** and save. Existing RSVP/payment consent does not imply monthly consent.
4. The existing 15-minute reminder cron considers positive, unpaid dues from midnight UTC+7 on the selected day of that due's period. Older overdue periods qualify; future periods do not qualify early.
5. A reported payment or pending proof suppresses reminders. Paid/zero dues, inactive Pro, suspended/unverified/unlinked accounts and withdrawn consent suppress new reminders. Free clubs may turn all reminders off.
6. At most one monthly notification per account/club per configured interval is created, even with several profiles or overdue periods. Transaction locks, account-level advisory locks and unique event keys prevent concurrent jobs from producing bursts. The notification opens the player's own due page. No email, SMS or Zalo delivery is added.

The worker preserves its existing numeric `after`/`next` pagination contract. It queries up to 100 bookings and 100 monthly dues and advances to the smaller saturated-lane boundary, so different ID ranges cannot skip eligible rows. Earlier-created qualifying dues are considered first; after one is paid, other outstanding dues remain eligible after the cooldown.

## Architecture and rollout

- Reusable writer/response, authorized data builders and route handler live under `v2/src/server/reports`; reusable download UI under `features/shared`.
- `write-excel-file@4.1.1` is pinned and writes buffers locally. Existing `read-excel-file` verifies generated files. No external reporting service is used.
- Apply additive `0008_monthly_reminders.sql` after `0007` **before** deploying. It adds settings and a separate false-by-default consent column, plus a lookup index; no existing consent or business rows are changed. Startup never migrates. Readiness checks the mapped new columns. Existing runtime table grants are retained.
- The guide retains its 43 articles and updates export, fee, reminder and player-consent instructions. Onboarding completion accepts any actually saved enabled reminder type; viewing pages still never completes missions.
- Rollback application source to the preceding release if needed; the additive columns/index can remain. Old source ignores them. Snapshot existing database/source/media and pass a local restore drill before production changes.

## Verification and manual QA

Integration coverage parses actual XLSX files, checks contact/money separation, leading zeroes, formula safety, filters, numeric receipts/refunds/reversals, empty sheets, Free use, revocation and row limits. Reminder coverage includes Vietnam midnight, independent consent, concurrency, multiple profiles/periods, proof suppression, payment state, authorization, suspension, read-only mode and pagination beyond 100 dues. Browser coverage exercises real downloads and settings persistence on desktop/mobile, plus regression flows for permissions, guides, onboarding, import/copy, notifications and SEO.

Manual QA:

1. Open downloaded workbooks in Excel/LibreOffice; check Vietnamese, phone zeroes, sum money columns and compare filters against the screen.
2. Try exports as owner, finance-only and check-in-only; revoke access and retry. Try an empty session/club and a legacy booking.
3. At 360/768/1440px, use keyboard to download, save reminders and change consent; check focus/error feedback and no horizontal overflow.
4. In an isolated test club, enable Pro + owner settings + linked/verified player consent. Confirm reminders at the chosen Vietnam date and after spacing, and none after payment, pending proof or opting out.
5. Check other reminder types, onboarding resume/replay, member import/copy, private links and ordinary product use. Never create production test transactions just to verify these flows.

Desktop Excel/LibreOffice and Safari/iOS opening behavior require manual checking; automated tests use XLSX parsing and Microsoft Edge. Files are snapshots, not synchronized reports. Notifications are in-app only; this release adds neither a payment processor for dues nor automatic monthly fee generation.

Local verification on 2026-11-15: **320/320 unit/integration tests in 34 files passed**, TypeScript and production build passed, and the standalone artifact scan found no private files. The desktop/mobile regression selection passed 14 existing cases; both new browser cases passed after correcting a test locator that also matched Next.js's route-announcement alert. A native PostgreSQL restore drill verified all 35 backed-up tables and the uploaded image, applied the additive migrations and passed regressions without modifying production. No lint command is configured.

The HTTPS preview regression also exposed an existing pause/unload race in host onboarding: Escape hides the tooltip immediately, but reloading could cancel the pending save. Pause requests now use Fetch keepalive while retaining the existing CSRF/revision checks. A browser regression adds 350ms network latency, reloads immediately and checks the server's persisted paused state before checking a fresh page; all four local onboarding desktop/mobile cases passed after the fix. Operator backup/release tests passed **19/19**.

## Release evidence, 2026-11-15

Feature commit `ebbec11` and pause fix `392cedf` are pushed to `main`. The final immutable candidate contains **344 allowlisted application files**, source SHA-256 `0c45839f86348e5e78b8e11e4c94f4036a31f73fed929c26a3d2cd9275f1fba4` and ZIP SHA-256 `d5c403559878c8c38a56e7123b6e57672e1e43cb718bac4caa62a5d4c254f67d`. The package, before-state snapshots, source/database/media backups, restore drill and verification reports are retained privately under `.vercel/nextjs/excel-monthly-20261115/`, with the immutable source under `candidate-final/`. No secrets or private backups enter Git or the runtime artifact.

Preview deployment `q4QO4BHqnL_IZ13U-z5Pp` is healthy on image `sha256:085362df5e3100ee92ad9d100f909da589b8819efd2e10499664f1574f8f9530`. The initial broad HTTPS run passed all **12 unaffected desktop/mobile cases** (privacy, exports/reminder settings, guides, import/copy, SEO and notifications); it exposed the onboarding pause race described above. All **6 focused cases on the final ZIP** passed, covering the new flows and all four onboarding scenarios. Together these cover 16 distinct desktop/mobile cases. Final preview HTTP/privacy/health/SEO checks passed **22/22**, retaining noindex and an empty sitemap. Preview SMTP stays disabled. Browser mutations and synthetic transactions ran only on disposable local databases and the authorized isolated preview.

The fresh native database backup restored all **35 tables/16 rows** at legacy revision `0011_fixed_member_fees`, verified the existing private image and passed additive-migration/regression/preservation checks on a temporary local PostgreSQL cluster, which was then stopped. The production dump SHA-256 is `4f3427a73d4b70b49f3deac30b5a555612a776123079b61b90217d2591b33105`. Preview and production migration 0008 preserved all 35 existing tables' original-column hashes, left the legacy revision unchanged and verified actual runtime grants. New monthly settings and player consent remain false by default.

Rollback retains the preceding healthy production image `sha256:e0016050ce490684917bda02ab10336550a5c0a9c984daef977d47b895bc12c7` and source ZIP SHA-256 `51dad27251e8ce24b8cce9f1ff6d8d75527e83add17ced359127f6befae635f5`. Restore compatible source/image with the current private environment and upload volume; preserve current business records and additive columns. Never restore an older database dump over later real transactions.

Production deployment `liTZQ6rdqLwZtVut67txx` completed on the **same tested image and ZIP as preview**, with one healthy container. All 344 deployed source files match the final manifest. UID/GID 10001, port 8000, secure cookies, existing SMTP, normal writes and the existing writable private upload volume are preserved; there is no public Docker port binding. Production passed **22/22 HTTP checks** and **10 authenticated read-only page checks**, including the revised guide articles and separate monthly-consent checkbox. The sitemap still contains only the three public canonical URLs. All **34 original non-operational tables** retain their original-column row hashes/counts; the legacy revision is unchanged. No production fixture registrations, fees, receipts, refunds or purchases were created.

The existing cron is still `*/15 * * * *`, with its private configuration at mode 0600 and its per-target file lock. An authenticated run against the new production image completed successfully with **0 eligible records**. Cron configuration was not changed and new reminder/consent defaults remain disabled. The verification does not claim that a real player received a reminder while no eligible opted-in due exists.
