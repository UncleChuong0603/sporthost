# SportHost in-product guide

The signed-in `/guide` route provides the complete task reference in Vietnamese. It complements the interactive onboarding; reading an article never records tutorial completion or creates business records. Content lives in `v2/src/features/guide/catalog.ts`, ordered by practical need, and the server-rendered page maps actions to existing routes with current club permissions. No migration, external service or dependency is added.

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

Automated and release results are recorded after final acceptance below.
