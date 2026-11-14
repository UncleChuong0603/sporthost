# Host onboarding

## Repository audit (2026-11-14, before implementation)

The host workspace is the authenticated `(workspace)` layout, with desktop navigation to overview, schedule, members, finance, clubs and account; mobile has five destinations and account in the header. Player, public registration and platform administration are separate experiences. `requireActiveAccount`, `requireClubAccess`, explicit capabilities and `requirePro` are the existing authority boundaries. Server actions validate origin, CSRF and the signed session. Tutorials must not grant permissions.

| Actual capability / route | Existing implementation / records | Tutorial mapping |
| --- | --- | --- |
| Overview `/dashboard` | `dashboardData`, permission-filtered tasks | Guide entry; no completion for viewing metrics |
| Create/manage club `/clubs`, `/clubs/new`, `/clubs/:id`, settings alias | club service, `clubs`, existing `LaunchSteps`; owner / edit settings | Core club mission; defaults/policies remain in existing form |
| One-off session `/schedule/new`, `/games/:id` | scheduling service, `game_sessions`; manage_session | Core session mission; real saved noncancelled session |
| Public invitation, copy/native sharing | `SessionShare`, existing `/join/:publicId`; manage_session or manage_bookings | Core share mission; successful clipboard/native share receipt, validated session scope |
| Fixed/guest members, editing `/members?club_id=` | member service, `members`; manage_bookings, contacts visibility separately | Optional members mission |
| Bank/QR, default fees `/clubs/:id#payment` | `ClubFinance`, bank snapshot and stored assets; manage_finance | Optional payment settings mission |
| RSVP, fixed players, walk-ins, approval/waitlist, private-link rotation/revocation `/games/:id` | scheduling/bookings services, `bookings`, participants; separate session/bookings/check-in rights | Optional invitation and registration missions; private-link guidance in registration copy |
| Attendance, replacement, lifecycle `/games/:id#attendance` | attendance service, participant status/version, session lifecycle | Optional attendance mission; actual marked participant |
| Expenses, cost sharing, waivers, issued charges, adjustments `/games/:id/billing` | finance service, expenses, batches, charges, adjustments; manage_finance | Optional billing mission; only an issued batch qualifies |
| Real receipts, refunds, reversal, payer groups, closing `/games/:id/billing` | money movements, immutable ledger; manage_finance | Optional receipt mission; genuine existing receipt only, never required |
| Monthly fees, debt, CSV `/finance` | club finance service, monthly dues, existing authenticated export | Optional monthly mission; CSV is documented guidance, no completion for visiting |
| Proof review `/payments/review`, private proof images | existing proof service, payment_proofs; manage_finance | Optional review mission; an actually reviewed proof |
| Account connections `/clubs/:id/connections`, member linking | connection service, invites/requests/member_account_links; owner, verified player consent | Optional connection mission; real linked profile |
| Weekly recurrence `/schedule/new`, rule list `/schedule` | recurring_rules, scheduling service; manage_session + active Pro | Optional Pro recurrence mission |
| Cohosts `/clubs/:id/access` | access service, club_access; owner, Pro for grants | Optional Pro access mission |
| Opt-in reminders `/clubs/:id/reminders` | reminder settings, account opt-in, cron; owner + active Pro | Optional Pro reminders mission |
| Pro checkout `/clubs/:id/subscription` | payment orders, payOS, server entitlements | Reference only; never purchase to finish a tutorial |
| Calendar / session CSV | authenticated `.ics` / `export.csv` routes | Reference only; no claim that a file was saved |
| Account `/account` | verification, password/session controls | Reference only; no tutorial around passwords or tokens |
| Platform admin, member notifications / member portal | separate layouts and role boundaries | Outside host missions |

Data audit: legacy schema includes clubs, hosts, access, members, sessions, rules, bookings, participants, dues, proofs, assets, audit, expenses, charges/batches/adjustments and movements. Additive schemas already provide member accounts, orders, administration, connections and notifications. There is no onboarding persistence. A small additive migration is therefore required; no legacy columns, business services, transactions or entitlements need replacing.

## Implementation contract

Registry entries declare a stable `data-tour` target, route, permission, trigger, prerequisites and evidence key. Core setup is club → saved session → successful copy/share. Advanced missions are optional and use existing data. “Pro host” describes learning; only the three labelled Pro missions need the paid/trial entitlement. Viewing, skipping, pausing and replaying never manufacture mission completion.

Preferences belong to the signed-in account. Progress belongs to an account and a club, with cascading foreign keys. Every read and write rechecks membership, suspension and capability. Evidence comes from current server records; clipboard/native share is a client success receipt with server validation of session/club/permission and open registration. It proves copying/sharing succeeded, not that a recipient received or opened the invitation. No public URL, contact information, financial amounts or secrets are stored in tutorial progress.

Welcome is nonmodal and opt-in. Explore later persists dismissal. Help opens the quest panel; resume, pause (Escape), skip, restart and replay remain available. Restart clears skips and selection, preserving real achievements and business data. Existing club facts are recognized without forcing duplicate data. Core missions use current club/session facts so deleted/cancelled records do not create a usable-session claim.

New targets must use registry-owned IDs, never user-provided CSS. Missing/hidden targets leave a route action and explanation. Navigation, successful action notifications and foreground refresh re-read evidence. There is no polling while idle. Tutorial UI never submits business forms, creates fixtures, starts a session, issues charges or records money for the user.

## Release and QA

Apply `v2/migrations/0006_host_onboarding.sql` with the existing explicit migration/backup workflow before deploying the new app. Runtime never migrates. Production migration/deployment is separate from local implementation verification.

Rollout: take and verify the existing PostgreSQL backup, apply the additive SQL with the operator role, and ensure the existing application role has SELECT/INSERT/UPDATE/DELETE on both new tables (no sequences are added). Run `/ready` with the runtime role and verify existing business-row preservation before deploying the artifact. Keep the previous artifact for rollback; these unused additive tables can remain if the app is rolled back. Local verification applied the migration only to the guarded loopback test database, without altering the 241 legacy columns or revision.

### Supported walkthrough

1. A host without clubs sees a nonmodal welcome with **Bắt đầu hướng dẫn** / **Khám phá sau**. Existing hosts use **Hướng dẫn** without an unsolicited overlay.
2. Start identifies the first unfinished, authorized setup mission. The tooltip links to the real route and spotlights its registry target. Type and save with the normal product form; the tutorial collapses while working and rechecks evidence after successful actions and navigation.
3. Club creation and noncancelled saved sessions are recognized from server records, including pre-existing records. Successful clipboard/native sharing produces the separately scoped client success receipt. Setup completion requires all three; skips do not contribute to the progress bar.
4. **Trở thành host chuyên nghiệp** lists 13 optional missions: members, bank/QR, fixed-member invitations, registrations, attendance, billing, real receipts, monthly dues, proof review, player connections, recurrence, cohosts and reminders. The last three carry Pro labels. Each mission is blocked until its real prerequisites and permissions are satisfied.
5. **Tạm dừng** / Escape saves the selected mission; **Tiếp tục hướng dẫn** resumes it, including optional missions. **Bắt đầu lại** clears skips in the selected club and starts from remaining setup work. **Xem lại hướng dẫn** keeps a completed mission visible without requesting duplicate data. Switch the learning club from the guide panel. Route club/session context is resolved on the server.

### Extension guide

- Add a stable entry to `src/features/onboarding/registry.ts` with Vietnamese task copy, group, target ID, internal route, trigger, evidence key, capability and prerequisite IDs. Keep IDs stable across copy/design changes.
- Attach `data-tour` to the actual visible control or section. IDs can be shared only by responsive alternatives; the spotlight chooses a visible instance. For collapsed features, target the disclosure summary. Add conditional targets only when the underlying action is actually available.
- Add the real evidence predicate in `server/modules/onboarding/service.ts`. Existing record evidence must remain scoped to the authorized club. Client action receipts are acceptable only for browser-only actions, with their verification limits stated explicitly.
- Shared retained server-action forms notify `sporthost:mutation-success` only after a successful result. This is a refresh signal; the server never accepts it as evidence. A new custom action UI should emit the same signal after its committed action. Redirects are picked up from route changes.
- Cover authorization, failed and successful actions, old data and missing targets with focused integration/browser tests. No tutorial may submit a financial or destructive action itself.

### Limits

- Browser copy/share receipts cannot prove delivery or recipient interaction. A denied clipboard operation or cancelled native share does not emit a receipt. Manual text selection/copy cannot be verified and is not automatically credited; users can skip or retry the browser copy/share action.
- Optional missions are feature-level walkthroughs, not separate tutorials for every subcommand. Refunds, reversals, replacements, waivers, cancellation policies and private-link management are explained within their existing feature flow. Calendar/CSV downloads, account security, Pro checkout, platform administration and the player portal are references or outside this host tour; no viewed page is presented as a completed mission.
- Business evidence is club-level: an existing authorized cohost can learn from work already done by the team. An accessible club counts as already available, while creation/replay remains subject to ownership. Skips and share receipts are scoped to the individual account and club. Revoked permissions hide protected mission completion; expired Pro blocks new Pro walkthrough actions.
- Old achievements are recorded for continuity, but current server facts determine displayed completion (except the browser share receipt). Removing the only session or cancelling it removes the usable-session evidence. Restart does not delete business data or the user's successful share receipt.
- Fixed-member invitation evidence uses an existing invited booking, a recurring-session invitation, or an RSVP audit receipt that records a positive created count. New RSVP audits include that count. Old replied invitations without sufficient evidence may stay pending; an empty RSVP action is never credited just because a member was added manually later.
- No email, Zalo message, fake booking, payment or subscription is sent/created by tutorial code. Test fixtures run only against the guarded disposable database. No runtime dependency was added.
- Browser automation covers Chromium/Edge desktop and mobile-sized viewports, reduced motion and keyboard actions. Physical-device keyboards, Safari/Firefox and screen-reader behavior need manual assessment before claiming comprehensive accessibility conformance.

### Manual QA checklist

- New host: try Explore later, reload, open Help, start, create a real club/session and copy its invitation. Confirm only successful actions advance and all three are required for completion.
- Existing host: select two clubs; verify existing records, independent skips and no unauthorized tasks. Pause an optional mission, reload, resume it, replay a completed mission and restart without duplicating any records.
- Deny clipboard permission, cancel native sharing, use text fallback, disconnect network, then retry. A failed action must keep the mission incomplete and the product usable.
- Use Tab/Shift+Tab and Escape in Help and the spotlight. Confirm visible focus, focus return, form access, responsive targets and no clipped tooltip at 360/375/768/1440px; repeat with reduced motion and a physical mobile keyboard.
- Open two tabs and make different guide changes. Confirm the stale revision is rejected and refreshed. Revoke a cohost, expire Pro or suspend an account; verify existing server restrictions still apply.
- Leave financial missions pending until a real business need arises. Verify the guide never submits, issues fees, confirms receipts, buys Pro or deletes anything on the user's behalf.

### Validation

Verified locally on 2026-11-14 against the guarded disposable PostgreSQL database:

- TypeScript typecheck: passed. Production Next.js build and standalone secret/artifact scan: passed.
- Complete Vitest run: **298/298 tests, 30 files passed**. Following the stricter RSVP evidence change, the focused onboarding unit/integration run also passed **24/24**, including the empty-RSVP/manual-booking regression. Coverage includes old records, roles, revocation, suspended accounts, expired Pro, concurrent revisions, cross-account/club boundaries, current business evidence and FK cleanup.
- Playwright regression selection: **14/14 passed**, zero skipped or flaky tests. Both desktop and 375px mobile projects cover onboarding, host workflow, cohost privacy, full signup → registration → proof/payment flow, SEO and notifications. Onboarding exercises copy denial, cancelled native sharing, successful copying, real creation, successful member save, replay, skip/restart, reload/resume, missing target, keyboard pause, reduced motion and 360/768/1440px resize checks.
- Final production build was rebuilt after excluding disabled selects from the Help keyboard cycle; its onboarding browser run passed **4/4** on desktop/mobile.
- Visual inspection: desktop/mobile spotlight and completion screenshots in `v2/test-results/onboarding-{spotlight,complete}-{desktop,mobile}.png` (ignored local artifacts). Tooltip placement has an explicit no-overlap assertion for the real club-name input.
- `git diff --check`: passed. No lint script/linter is configured in the repository; no lint result is claimed.

Production onboarding migration/deployment completed on **2026-11-15** with the Excel/copy/activation release. See [HOST_PRODUCTIVITY.md](HOST_PRODUCTIVITY.md) for exact source, migration, backup, browser acceptance and production preservation evidence. The existing dashboard change keeping **Tạo buổi chơi** always visible was retained as requested; the destination still enforces existing server permissions.
