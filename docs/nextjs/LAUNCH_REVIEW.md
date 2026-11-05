# Pre-launch host/member review — 2026-11-05

This review covers the current Next.js application in `v2/`. It is a source and local acceptance review, not a production deployment or evidence of a real bank/payment-provider transaction.

Release packaging, fresh production backup/restore and isolated preview activation are recorded separately in [LAUNCH_RELEASE.md](LAUNCH_RELEASE.md).

## Completed product gaps

- `/` now explains the product and provides distinct host and player entry points. Guest links remain usable without an account.
- Owners get a three-step club setup guide: receiving-bank/QR details, member profiles and the first session. Receiving details should be set before inviting players because existing obligations retain their original payment snapshot.
- Verified, owner-linked players can discover open sessions in their clubs at `/me/schedule` and register directly without waiting for a host invitation or entering contact details again. Host approval, gender prices, capacity, waitlists, recurrence priority and RSVP deadlines remain enforced. Repeated submissions open the original booking. Registration never creates an identity link or host permission.
- Fixed members can respond again after declining while RSVP is open. Finished sessions and rejected registrations do not display an available RSVP. Direct requests cannot override host rejection or recorded attendance. Rejected bookings cannot be changed to cancelled through player actions to bypass that rejection.
- Password recovery preserves the member audience through the form, email link, reset and login result. Expired one-use links retain their HTTP error status and provide the appropriate recovery link. Anonymous member-resource errors point to member login.
- Player payment details show the pre-issue amount/status or explicitly wait for cost sharing. Issued proof submissions select only payers with outstanding debt; zero/fully paid obligations cannot receive another proof. Issued debt remains payable after cancellation. Separate partial transfers remain supported, and uploading a proof never records received money.
- Pro checkout uses a nine-character transfer description, compatible with payOS's stricter bank-account limit. The provider test double enforces that documented boundary rather than accepting arbitrary descriptions. See the [official API contract](https://payos.vn/docs/api/).

## Accepted flows

**Host:** `/signup` → create club → set receiving details → add/link members → create one-off or recurring session → share link/invite → approve or waitlist → attendance → issue fees → review proof/record actual receipts → adjustments/refunds → close while retaining debt.

**Member:** `/me/signup` → verify email → owner links the account to the correct player profile → `/me/schedule` → respond to an invitation or register for an open club session → edit permitted guest group/cancel within policy → view payment details → transfer and upload proof → host rejects with a reason or confirms actual receipt → view remaining debt/credit.

**Guest:** public session link → phone and group details → pending/confirmed/waitlisted registration → private attendance/payment link. Account signup is optional; account access still requires explicit owner-approved linkage.

Authentication uses the existing self-hosted email/password/session implementation. Google authentication is not required or added.

## Verification and release boundaries

Final local acceptance on 2026-11-05:

| Check | Result |
| --- | --- |
| `npm test` | 210/210 cases, 18 suites passed after the final payOS description correction. |
| `npm run build` | Passed, including strict TypeScript checking and the standalone scan for environment files, private keys, test outputs and Python files. |
| Full desktop/mobile Playwright suite | 28/28 passed, zero retries or skips, in the isolated local checkout on port 3103. |
| Payment provider boundary | All 9 payOS integration cases passed with a test double enforcing the nine-character description limit and the actual SDK signature verifier. No live payment request was created. |

The isolated browser run used the same 153 application source files as the working tree before the final transfer-description correction. That last correction was then verified by the complete 210-case suite and a fresh production build. Browser evidence and desktop/mobile screenshots are retained locally under `v2/test-results/launch-review-20261105/`; `browser-last-run.json` records a passing run. Earlier failed runs remain separate: an RSVP assertion waited for a removed form instead of its persisted result, and a multipart QR setup request had an `ECONNRESET` during a concurrent build. The form assertions now check persisted states; the isolated final browser run did not reproduce the connection failure.

Local verification includes database integration tests for direct registration, last-seat races, idempotency, cross-club/account denial, unlinking/unverified accounts, gender pricing, partial payment, cancellation with issued debt and rejection-safe RSVP. The new desktop/mobile browser flow covers the public entry page, host setup, member signup/verification/linkage, direct registration, approval, proof rejection and retry, confirmed payment and member password recovery.

The existing regression suite also covers recurring schedules, attendance, GROUP/SPLIT billing, exact integer-VND allocation, adjustments/refunds, monthly dues, private media, cohost permissions, exports and legacy form routes. See the recorded command results for the final pass counts.

Concurrent payOS/Pro work is retained and checked with the combined source. Its integration tests use a provider test double. Before enabling that checkout in production, apply its reviewed additive migration, configure the production payOS credentials and webhook, and verify a real provider transaction separately. Do not treat a browser return URL or a screenshot as payment confirmation.

No production migration, deployment, email or financial write is part of this review. Existing operations still require scheduled off-server backups, alerting and cleanup-retry scheduling; see `RELEASE_RUNBOOK.md` and `PROGRESS.md` for the previously recorded operational limits.
