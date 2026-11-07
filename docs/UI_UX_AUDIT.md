# SportHost UI/UX audit — 2026-11-07

Scope: the existing `v2/` full-stack application. This is a local source review and implementation; no deployment or production data changes are authorized. Historical release reports are context, not evidence for this revision.

## Architecture and contracts

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, existing Radix Slot/CVA buttons, React Hook Form/Zod, Drizzle/PostgreSQL. Server Components load authorized data; Server Actions and native POST compatibility handlers share server services. Self-hosted signed sessions, CSRF, owner/cohost capabilities, verified member linkage and guest bearer links remain authoritative. Private media is sanitized and served through authorized routes. payOS already handles Pro subscriptions; club payments remain host-controlled bank/QR transfers with manual proof review. No new payment integration is introduced.

Schema inventory: hosts, clubs, members, club_access, game_sessions, recurring_rules, bookings, booking_participants, monthly_dues, payment_proofs, stored_assets, expenses, charge_batches, charges, charge_adjustments, money_movements, audit_logs, request_limits, email_tokens, subscription_requests, platform_ledger_entries, deletion/media jobs, payment_orders and legacy revision tracking. Startup never migrates.

## Findings before implementation

| ID | Severity | Finding / effect | Resolution |
| --- | --- | --- | --- |
| UX-01 | P1 | Host mobile navigation presents six unlabeled icons; no current-page indication. | Implement labeled responsive navigation and active nested routes. |
| UX-02 | P1 | React action forms can reset uncontrolled inputs after a handled server error, losing settings/member/session input. | Preserve editable values on failed actions; validate through browser regression. |
| UX-03 | P1 | Uploads lack preflight type/size feedback and preview; generic success copy does not distinguish proof submission from receipt. | Add shared image picker and proof-specific feedback; preserve server validation. |
| UX-04 | P1 | Destructive actions can submit immediately, including financial reversal, cancellation and revoked links. | Shared accessible confirmation with consequences; keep existing typed club deletion. |
| UX-05 | P2 | Long auth marketing panel pushes mobile login/signup below the fold. | Compact mobile identity and clearer account form hierarchy. |
| UX-06 | P2 | Most host/member dates expose YYYY-MM-DD; timezone ambiguous. | Shared Vietnamese presentation, explicit Vietnam time; preserve raw input/storage formats. |
| UX-07 | P2 | Only subscription has route loading UI; error recovery is visually isolated. | Shared loading/inline error states and recovery links. |
| UX-08 | P2 | Clubs list duplicates dashboard including overview title/stats. | Dedicated club inventory with correct heading, role and next action. |
| UX-09 | P2 | Empty search results give no clear reset; empty schedule has no creation path. | Reusable empty state with actionable links and visible filter labels. |
| UX-10 | P2 | Status pills use similar colors for confirmed, pending and cancelled states. | Semantic badges with text; payment reports never become confirmed receipts. |
| UX-11 | P2 | Narrow layouts can squeeze filters, long names, selects and monetary values. | Min-width/wrapping rules, stacked filters, touch targets and safe-area spacing. |
| UX-12 | P2 | Tokens cover only a few colors; repeated surface/input styles diverge. | Document and refine centralized tokens, controls and shared surface conventions. |
| UX-13 | P2 | Host overview repeats the already completed club query. | Reuse the authorized club list within the same request. |
| QA-01 | P1 | Configured disposable local database is unreachable at baseline. | Attempt isolated local PostgreSQL; record actual outcome in QA report. |
| QA-02 | P2 | No lint script/config in package manifest. | Report lint unavailable; use TypeScript, tests, production build and browser checks. |
| UX-14 | P1 | Input boundaries reused card border color, measuring only 1.29:1 against white. | Separate `--control-border` gives 3.46:1 on white and 3.18:1 on workspace; preserve red invalid and teal focus states. |

No new P0 established during static inspection. This does not establish absence of P0 issues; authenticated runtime and payment evidence must be verified.

## Discovery inventory

All tracked repository areas were inventoried: application routes/features/server modules/domain models, tests, migrations, operator scripts, release documentation, legacy design references and marketing assets. Existing private environment files were only inspected programmatically for test-target safety; secrets are not included here. Full route inventory and final implementation/remaining findings are appended after validation.

## Baseline

- Clean working tree at start.
- TypeScript passed.
- Unit suite passed: 157 tests / 11 files.
- Configured database is loopback and named `_test`, but not reachable.
- No lint script. No production mutations, deployment, infrastructure changes or new runtime dependencies.

## Complete page inventory

All 34 page files were inspected, including shared components they render. Routing groups are omitted from URLs. Query filters retain their existing GET contracts.

| Route | Access boundary | Features / server integration |
| --- | --- | --- |
| `/forgot-password` | Public / account token | AccountForm |
| `/login` | Public / account token | AuthPage |
| `/reset-password` | Public / account token | TokenPage |
| `/signup` | Public / account token | AuthPage |
| `/verify-email` | Public / account token | TokenPage |
| `/attend/[key]` | Public session / scoped guest capability | guestBooking; ActionForm; PartyEditor; GuestFinance; BookingDecision, SessionDetails; CalendarDownload |
| `/dues/pay/[key]` | Public session / scoped guest capability | ImagePicker; duePage; UploadForm |
| `/join/[publicId]` | Public session / scoped guest capability | publicSession; GuestForm |
| `/me/bookings/[bookingId]` | Signed account + verified, owner-linked profile for club data | guestBooking, guestFinance; ActionForm; PartyEditor; PlayerFinance; panel; BookingDecision, SessionDetails; CalendarDownload |
| `/me/dues/[dueId]` | Signed account + verified, owner-linked profile for club data | ImagePicker; duePage; UploadForm; panel |
| `/me` | Signed account + verified, owner-linked profile for club data | playerCalendar, playerPayments, playerProfiles; BookingCard, MemberEmpty, panel |
| `/me/payments` | Signed account + verified, owner-linked profile for club data | playerPayments, pageNumber; PaymentCard, MemberEmpty, MemberPagination, panel |
| `/me/profile` | Signed account + verified, owner-linked profile for club data | playerProfiles; ActionForm; AccountForm; MemberEmpty, panel |
| `/me/schedule` | Signed account + verified, owner-linked profile for club data | playerCalendar, pageNumber; BookingCard, MemberEmpty, MemberPagination; OpenSessions |
| `/me/login` | Public / account token | AuthPage |
| `/me/signup` | Public / account token | AuthPage |
| `/account` | Signed host + per-club capability | AccountForm |
| `/admin` | Signed platform administrator | platformOverview; ActionForm |
| `/admin/platform-ledger` | Signed platform administrator | platformLedger; ActionForm |
| `/clubs/new` | Signed host + per-club capability | SettingsForm |
| `/clubs` | Signed host + per-club capability | listClubs; ClubCard |
| `/clubs/[clubId]/access` | Signed host + per-club capability | clubAccessDetails; AccessForm |
| `/clubs/[clubId]` | Signed host + per-club capability | clubSettings; SettingsForm; ClubFinance; LaunchSteps |
| `/clubs/[clubId]/settings` | Signed host + per-club capability | Authentication, account form or shared page composition |
| `/clubs/[clubId]/subscription` | Signed host + per-club capability | subscriptionDetails; ActionForm; PaymentWatcher |
| `/dashboard` | Signed host + per-club capability | listClubs; DashboardOverview; ClubCard |
| `/finance` | Signed host + per-club capability | financeLedger; listDues, clubFinancialSettings; ActionForm |
| `/games/[gameId]/billing` | Signed host + per-club capability | financeView; ActionForm |
| `/games/[gameId]` | Signed host + per-club capability | SessionEditor; AttendanceTools; LegacyMoney; hostSession; ActionForm; ShareSession; CalendarDownload |
| `/members` | Signed account + verified, owner-linked profile for club data | listClubs; listMembers; MemberForm; ActionForm; clubMemberAccounts |
| `/payments/review` | Signed host + per-club capability | listClubs; listProofs; ActionForm |
| `/schedule/new` | Signed host + per-club capability | listClubs, sessionDefaults; SessionForm |
| `/schedule` | Signed host + per-club capability | listSessions; listClubs; RuleList |
| `/` | Public / account token | Authentication, account form or shared page composition |

## HTTP endpoint inventory

| Endpoint | Methods | Access / behavior |
| --- | --- | --- |
| `/attend/[key]/calendar.ics` | GET | Public session / scoped guest capability |
| `/attend/[key]/qr` | GET | Public session / scoped guest capability |
| `/dues/pay/[key]/qr` | GET | Public session / scoped guest capability |
| `/me/bookings/[bookingId]/calendar.ics` | GET | Signed account + verified, owner-linked profile for club data |
| `/me/bookings/[bookingId]/proof` | POST | Signed account + verified, owner-linked profile for club data |
| `/me/bookings/[bookingId]/qr` | GET | Signed account + verified, owner-linked profile for club data |
| `/me/dues/[dueId]/proof` | POST | Signed account + verified, owner-linked profile for club data |
| `/me/dues/[dueId]/qr` | GET | Signed account + verified, owner-linked profile for club data |
| `/clubs/[clubId]/qr` | GET | Signed host + per-club capability |
| `/finance/export.csv` | GET | Signed host + per-club capability |
| `/games/[gameId]/calendar.ics` | GET | Signed host + per-club capability |
| `/games/[gameId]/export.csv` | GET | Signed host + per-club capability |
| `/proofs/[proofId]/image` | GET | Signed host + per-club capability |
| `/api/webhooks/payos` | POST | Probe / provider signature |
| `/health` | GET | Probe / provider signature |
| `/internal/legacy` | POST | Restricted compatibility adapter |
| `/internal/legacy-auth` | POST | Restricted compatibility adapter |
| `/ready` | GET | Probe / provider signature |

Native POST compatibility families are independently inventoried in `docs/nextjs/sprint-0/ROUTE_PARITY.csv` and `v2/src/server/compatibility/legacy-paths.ts`: auth/recovery, club settings/fees/payment uploads/deletion/cohosts, member entry/edit, session creation/settings/lifecycle/cancel/attendance/booking decisions/private links, recurring rules, expenses/billing/adjustments/money, monthly dues/proofs and admin ledger/trial. Server Actions retain authentication, CSRF and capability checks in their existing services.

## Screen and journey assessment

The inventory above covers 34 page files and 18 Route Handlers. The following matrix assesses the intent, hierarchy/actions, navigation, forms/states, accessibility, responsive behavior, integration and performance of every screen family. Final runtime outcomes are recorded in the separate QA report, rather than inferred from this matrix.

| Screens | Primary intent and hierarchy | Navigation / actions / information architecture | Forms, loading, empty and errors | Responsive / accessibility / performance | Business integration |
| --- | --- | --- | --- | --- | --- |
| `/` | Explain club management and separate host/player entry | Host signup is the primary action, player login/signup has its own panel; explain the next three steps | No invented dashboard metrics or signup promises | Responsive hero, semantic headings, real links, system font, no external image/font requests | Actual auth routes and guest-link explanation |
| `/login`, `/signup`, `/me/login`, `/me/signup` | Put the form before marketing content on phones | Clear audience switching, password recovery, return to homepage | Field validation, server error, show/hide password, pending submission | One form h1, associated errors, autocomplete and 16px inputs; compact mobile identity | Existing shared signed-session auth and audience destination |
| `/forgot-password`, `/reset-password`, `/verify-email` | Recover or verify the existing account | Preserve member/host recovery destination and one-use link rules | Retain failed input, truthful mail-unavailable state and expired-link recovery | Single-column controls, accessible labels and status; provider email delivery separately gated | Existing SMTP, token expiry/consumption and session revocation |
| `/dashboard` | Show real upcoming sessions, pending decisions and permitted money | Primary creation action follows scheduling rights; club list links to scoped setup | First-club onboarding steps; existing users see real data | Stacked cards on mobile, labeled section navigation, reuse request-scoped club query | Existing dashboard queries, permission-filtered financial data |
| `/clubs` | Find a club and understand the current role | Dedicated inventory replaces the dashboard alias; create/open club | Actionable first-club empty state | Shared wrapping cards and focus treatment; avoids loading dashboard finance for this page | Existing listClubs capability/ownership result |
| `/clubs/new`, `/clubs/[clubId]`, `/clubs/[clubId]/settings` | Create/configure CLB and establish first useful actions | Back link on creation; existing setup checklist links to payment/members/schedule; preserve settings alias | Retain failed settings, preview/validate QR, show current QR, typed deletion plus consequence dialog | Stacked settings, full-width fields, distinguishable input boundaries; long configuration page remains intentionally scrollable | Existing club services, snapshotted bank info, private QR and owner-only deletion |
| `/clubs/[clubId]/access` | Grant the minimum cohost rights and revoke access | Explain role versus custom capabilities; confirm revocation | Shared result/pending/error handling, retain failed input | Touch-friendly checkbox labels, responsive forms and audit list | Owner/Pro checks and persisted rights unchanged |
| `/clubs/[clubId]/subscription` | Understand Basic/Pro, trial and actual purchase state | Existing checkout, refresh/cancel and return flow retained | Disabled configuration state; return URL never implies payment | Shared typography, controls and disclosure styling; existing bounded polling cleanup | Existing payOS signatures, verified provider order and cumulative renewal; real settlement not tested locally |
| `/schedule`, `/schedule/new` | Find a session or create one with correct defaults | Visible labeled filters, scoped create action, clear back link and reset/empty action | Preserve creation errors; advanced recurring/policy disclosure; loading skeleton | Filter grid stacks on phones; cards wrap dates/venue/capacity/status; native time input stays unchanged | Existing schedules, capacity, club defaults and Pro recurrence policy |
| `/games/[gameId]` | Manage registration, play lifecycle and attendance | Keep roster, public sharing, scoped private links and billing together | Empty roster, pending actions, reason fields; confirm cancellation and private-link replacement/revocation | Shared status badges, wrapping roster cards/actions, Vietnam date display | Existing group approval, quotas, waitlist, optimistic attendance version and authorization |
| `/games/[gameId]/billing` | Reconcile exact charges and received money | Draft → issue → money → close, preserving debt; confirm issue/reversal/expense deletion | Shared action errors/results; reasons and request keys preserved | Cards rather than wide tables, readable amounts and long reasons | Existing integer-VND allocation, immutable batches, append-only money and version checks |
| `/members` | Find/edit a player and link the correct verified account | Club scope, search/kind/gender filters; explain identity linkage and confirm unlink | Retain invalid phone/name input; successful add and empty/reset guidance | Wrapping mobile cards, labeled controls and dropdowns | Existing owner/contact/edit distinctions, normalized phones and explicit account approval |
| `/finance`, `/payments/review` | Find outstanding obligations and review actual receipts | Club/period/status filters, CSV, scoped proof review | Empty ledger/review states; confirm money receipt after bank check | Wrapping financial cards, month/date presentation, mobile filter controls | Real receipts remain separate from reported proof; original ledger/export contract retained |
| `/join/[publicId]` | Register self or whole party from a public club link | Distinguish registration request from confirmed seat; return to existing own registration | Existing two-step phone lookup and duplicate/closed states | Single-column mobile registration, local date and explicit UTC+7 | Existing guest cookie, reviewed lookup token, capacity/group rules |
| `/attend/[key]` | See authorized party status, RSVP, attendance and payments | Public-session back link, private edit/cancel/payer/calendar actions | Status explanations, host reason, confirmation before whole-group cancellation | Shared cards, private inline QR and labeled proof preview/upload | Existing bearer ownership, revocation/expiry, accepted policy snapshot and manual money |
| `/dues/pay/[key]` | Pay the correct monthly obligation | Display exact bank/QR snapshot and proof submission | Proof type/size guidance, pending verification distinct from paid | Inline QR, readable account number, mobile upload controls | Existing scoped due capability and server-sanitized private proof |
| `/me` | Show linked clubs, invitations and upcoming participation | Labeled member destinations and meaningful onboarding action | Unverified/unlinked/empty states retain honest instructions | Stacked real summaries, correct booking-card heading level and safe-area navigation | Existing verified profile linkage and account-scoped queries |
| `/me/schedule` | View upcoming/history and register in linked clubs | Selected tabs and pagination; open-session action | Pending/waitlisted explanation and empty-history state | Semantic booking headings, readable venue/date and mobile cards | Existing eligibility/registration and group rules |
| `/me/payments` | Understand own debt, reported proof and credit | Detail links preserve booking/due scope and pagination | Never label reported proof as confirmed receipt | Wrapping monetary cards and tabular amounts | Existing member balance/credit queries |
| `/me/bookings/[bookingId]`, `/me/dues/[dueId]` | Act on the correct personal registration/payment | Back links, permitted RSVP/edit/cancel, payer mode and one-time calendar | Proof preview, limits, transport failures; keep image on failure; confirmed financial state remains server-owned | Inline private QR, keyboard confirmation, native upload and six-viewport checks in QA | Existing account-owned access, policy/QR snapshots, report review and cancellation rules |
| `/me/profile`, `/account` | Verify identity or change password | Clear linked-profile explanation and audience switch | Preserve invalid account input, disabled SMTP state, revoke old sessions on password change | Single-column accessible forms and wrapping emails | Existing account security, no automatic phone identity matching |
| `/admin`, `/admin/platform-ledger` | Operate the platform separately from club finances | Admin-only navigation; retained trial/ledger/audit actions | Shared action states and required edit reasons; existing empty ledger | Global controls/focus/typography benefit these screens; dense audit history stays collapsible | Persisted administrator checks, independent ledger and audit history unchanged |
| Global 404/error, host/member layouts | Keep recovery and orientation clear | Homepage recovery avoids sending anonymous players into host-only routes; active nested navigation | Retry state never displays raw SQL/stack traces; route loading announced | Skip link, focus outline, reduced motion and one main region | Existing Proxy preserves pre-stream 401/403/404 access semantics |

## Implementation boundaries

No schema migration, infrastructure/deployment change, production write, API-contract rewrite or runtime dependency was introduced. Native compatibility POSTs and exports remain supported. The only server query change reuses an already authorized club list in the same dashboard request. Browser test setup now checks the database target before any test starts, and the fixture pool and web server receive the same disposable connection string.

The old design reference is marked as superseded by `DESIGN_SYSTEM.md`. `UI_UX_QA_REPORT.md` records failed/interrupted attempts as well as final results; only completed runs count toward acceptance.

## Remaining scope and risks

| Severity | Remaining item | Release implication |
| --- | --- | --- |
| P1 verification gate | Physical iPhone/Safari and Android file/date/keyboard/QR behavior is not established by Windows viewport tests. | Manual mobile acceptance before a broad public rollout. |
| P1 verification gate | Actual SMTP deliverability and real payOS settlement are external to the local test environment. | Operator acceptance with real service/bank evidence; no invented payment success. |
| P2 | Full screen-reader and zoom/reflow audit is not complete. | No blanket WCAG conformance claim. Keyboard/labels/focus checks have a narrower scope. |
| P2 | Existing ledger loads all accessible session records and performs per-session financial reads. | Benchmark representative large clubs before expanding scale; no unmeasured performance claim or risky financial-query rewrite in this UI revision. |
| P2 | Host schedule/member lists still lack server-side pagination; member portal retains its existing pagination. | Observe realistic club size and implement bounded queries when needed. |
| P2 | Global metadata and response headers still use `noindex, nofollow`. | Preserve the existing indexing policy in this revision; review the public landing page's SEO policy before a marketing/discovery launch. |
| P3 | Some inherited admin/subscription copy still uses “trial”. | Follow-up terminology cleanup; main club setup now uses “Dùng thử Pro”. |

These are disclosed remaining checks/improvements, not evidence of a new security regression. Final known functional failures, if any, are listed in the QA report and override a conditional release recommendation.
