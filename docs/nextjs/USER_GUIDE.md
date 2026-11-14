# SportHost in-product guide

The signed-in `/guide` route provides 43 task-reference articles in Vietnamese across eight prioritized groups (the last five articles are platform-admin-only). It complements the interactive onboarding; reading an article never records tutorial completion or creates business records. Content lives in `v2/src/features/guide/catalog.ts`, ordered by practical need, and the server-rendered page maps actions to existing routes with current club permissions. No migration, external service or dependency is added.

## Feature inventory and order

| Priority | Group | Actual functions covered |
| --- | --- | --- |
| 1 | First usable club/session | Create club, create session, pricing modes, gender limits, deadlines/policies, sharing, interactive onboarding and daily dashboard tasks |
| 2 | Members/registration | XLSX import, manual members/filtering/editing, group approval/waitlist/cancellation, fixed-member RSVP/walk-ins, rotate/revoke private links and verified player connections |
| 3 | Day of play | Attendance/reset/check-out/replacement, registration open/close, start/finish/reopen, edit settings and cancel sessions |
| 4 | Money | Bank/QR/default fees, expense drafts, allocations/waivers, fee issuance, pre-issue receipts, partial receipts/refunds/reversals, proof review, monthly dues, ledger/debt reminders/adjustments/close, existing CSV exports and ICS downloads |
| 5 | Time savers/Pro | Free session copying, weekly series/generate/extend/stop, cohost rights/revocation, opt-in in-app reminders, Pro purchase/renewal and payment status/history |
| 6 | Player flows | Public/group registration without account, RSVP/edit/cancel, payment/proof/retry, signup/verification/connection requests, schedule/payments/profile and notification consent |
| 7 | Account/club maintenance | Verification/password/recovery/logout, default club settings and confirmed club deletion |
| 8 | Platform administration | Overview/search/filter/pagination/detail, supported reviewed actions with reasons, subscription administration, platform ledger entry/edit/history, audit and activation cohorts |

The platform-admin group is excluded from non-admin server-rendered content. Article calls to action require the matching club permission, and Pro creation links require a current entitlement. The descriptions remain readable when a host lacks a capability, with a clear explanation instead of an unauthorized action link. Every actual destination continues to validate its own authorization.

The page offers accent-insensitive multiword search, group filters, a club selector, empty-result recovery and stable individual URLs (`/guide?topic=excel-members#guide-excel-members`). Search and expansion use normal GET forms and native details controls. Club selection comes only from authorized memberships; foreign IDs are rejected. Desktop has a Guide destination; mobile retains five bottom destinations and reaches the reference through the global “Tất cả hướng dẫn” entry next to interactive Help. All content remains noindex.

## Maintenance and limits

Update the catalog when changing a real product flow. Do not describe unimplemented features as available. In particular, there is no automatic Zalo/email messaging, automatic monthly-dues reminder, bank transfer/refund triggered by manual money records, live calendar synchronization or proof that sharing reached a recipient. Prices and trial periods are read on the existing purchase screen, not hardcoded into articles. Administrative and financial guidance directs users through existing validation and confirmations.

The reference links to the session list when a task needs the host to pick a real session; it does not guess a session ID. It is an authenticated host reference including instructions hosts can give players, rather than a public help-sharing portal. It does not store read history or mark viewed articles complete.

## Manual QA

1. Open from desktop navigation and from “Tất cả hướng dẫn” on a phone. Check the initial order, five bottom destinations and long Vietnamese/club names at 360/768/1440px.
2. Search `nhap excel`, open the individual article URL, reload, collapse/expand with Enter, and use the empty-result recovery. Try forms with JavaScript unavailable.
3. Switch between two authorized clubs, follow the action link and verify the intended club. Check no-club, revoked rights, check-in-only, expired Pro and foreign club IDs.
4. Read the task steps against the actual product, especially fee issuance, pre-issue receipts, refunds/reversals and connection approval. Do not perform production transactions merely to test a guide.
5. Platform admin can see the final group; other accounts cannot see its content. Check onboarding resume/pause still works and reading guides never completes missions.

## Automated verification

Source commit `59ec0a2`: production build, TypeScript and standalone artifact scan passed; **310/310 unit/integration tests across 32 files** passed with `npx vitest run --no-file-parallelism`. The local desktop/mobile guide, Excel/copy and onboarding selection passed **8/8**. Guide coverage includes no-club behavior, Vietnamese search without accents, empty results, direct article links/reload, keyboard disclosure, scoped action links, expired Pro, check-in-only rights, foreign-club rejection, admin-only visibility, 360/768/1440px overflow, five mobile destinations and no automatic mission completion. No lint script is configured.

Frozen source SHA-256: `6e8a235834a5169341c1a6660a9b5d531e20273c8d96cca9d57b9ae8cac0b531`; source ZIP SHA-256: `da2f4070100029b557b6edaf47edc234628de7c1ff43f04956e2f1eac9734dec` (332 files). Private operator artifacts and screenshots remain ignored.

HTTPS preview deployment `cyAThSNnt9u8NwKPb07gm` passed **8/8 desktop/mobile browser cases** and **18/18 HTTP checks** on that exact ZIP, with healthy image `sha256:e0016050ce490684917bda02ab10336550a5c0a9c984daef977d47b895bc12c7`. Preview remained noindex with an empty sitemap. Existing schema is reused; no migration or production fixture writes are needed.

Production deployment `OJ_dQqzn5qmRjAyw2aRbM` completed on **2026-11-15** using the **same preview-tested image** and ZIP. All 332 deployed source files match the manifest. Production passed **18/18 HTTP checks** plus **eight authenticated read-only page checks**, including the guide and direct Excel-article URL. All 31 original non-operational business tables still match the verified backup from the host-tools release; the legacy revision is unchanged. Runtime flags, UID/GID 10001, port 8000, SMTP, secure cookies and the existing read/write upload volume are preserved; there are no public Docker port bindings. No synthetic production accounts, members, sessions, transactions or messages were created for guide acceptance.

Rollback retains the previous compatible source ZIP (SHA-256 `5ea26fd156ede7b812b9030b53df683ae21ef04adf472d034c1c2202f5d40615`) and image `sha256:7d47a3114160993efa4eae4ad3f0e72844c3645d24aea48b2bc4982535e5fb53`. Preserve current database rows and uploads on rollback. Browser evidence is Edge/Chromium, not a claim of physical-device, Safari, screen-reader or native Excel verification.
