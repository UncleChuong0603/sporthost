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
