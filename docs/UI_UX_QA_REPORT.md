# SportHost UI/UX QA report — 2026-11-07

This report applies to the local UI/UX revision in this working tree. Historical production/preview reports are not counted as validation of this revision. No deployment was performed.

## Environment and isolation

- Windows, Node 22.16.0 from the existing workspace toolchain, repository-pinned Next.js/React/TypeScript/Vitest/Playwright.
- PostgreSQL 18.6 portable, separate local cluster bound to `127.0.0.1:55432`, database `sporthost_ui_final_test`. Schema initialized from the existing schema-only fixture and additive member/payment migrations, only inside this new test database.
- The application `.env.local` was preserved. Runtime test settings were supplied to child processes, including a synthetic session key and a separate ignored media directory. SMTP disabled for browser tests; SMTP integration tests use a localhost STARTTLS sink. payOS browser keys intentionally empty; provider integration tests use existing controlled SDK test doubles. No real mail, real bank transfer or provider checkout was initiated.
- PostgreSQL download source: [EDB binary distribution](https://www.enterprisedb.com/download-postgresql-binaries), linked from the [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/). No database service was installed and no production database was accessed.
- Browser configuration and fixture pool now use the same test URL. A deliberate remote synthetic URL was rejected before test execution with `Browser tests refuse remote or non-test databases`.

## Completed non-browser checks

| Check | Actual result | Evidence |
| --- | --- | --- |
| Baseline TypeScript | PASS | `npm run typecheck` before edits |
| Baseline unit suite | PASS: 157 / 157, 11 files | Existing Vitest suite before implementation |
| Full final unit/integration suite | PASS: 234 / 234, 22 files, zero skips | `.tools/ui-qa-unit-integration.json`; 88.17s recorded run |
| Added formatting coverage | PASS: 3 cases within the full suite | Vietnam wall time versus UTC, invalid/empty timestamps, Vietnamese date/period display |
| Existing business/auth compatibility | PASS within the full suite | Password/session fixtures, route contracts, billing, group/attendance locks, explicit member links, proof isolation, subscriptions and SMTP |
| Production build | PASS on the final runtime source | Next.js standalone compilation and TypeScript; rebuilt after upload-response refinement |
| Standalone TypeScript check | PASS on the final source and added browser tests | `npm run typecheck` |
| Artifact privacy scan | PASS on the final build | Existing `scripts/check-standalone.mjs`: no env files, private keys, test outputs or Python files |
| Lint | NOT TESTED: no lint script/config exists | Package manifest; no unrequested tooling dependency introduced |
| Working-tree whitespace check | PASS at last review | `git diff --check` |

## Browser acceptance

Final run results and screenshots are recorded here after execution. Test scenarios are actual browser/server/database interactions, not mocked page renderings; only deliberate transport-failure cases intercept upload responses.

Initial browser-candidate inventory: 175 files (application source, package/lock manifest and Next configuration), SHA-256 `1d4b2f3c0008cbe299b1f0f16c196bad918d8c37de8abe6a9cdd7c59ae6e9fae`. The candidate was unchanged during the first browser checks; generated assets were checked to contain the guarded upload response handler. The later keyboard finding below requires a new build and focused regression run; its final inventory/result is recorded after verification.

The completed broad run executed all 32 desktop/mobile cases: **27 passed, 5 failed, zero skips**, in 16.7 minutes. The failures were the two obsolete proof-message assertions, the two keyboard-focus cases, and one native-forms connection reset described below. These are not presented as a clean run. Between that candidate and the final runtime source, three application files changed: `features/shared/action-form.tsx` (the Tab-cycle correction), `features/finance/legacy-money.tsx` and `app/(workspace)/finance/page.tsx` (explicit confirmations for reversing an advance/monthly receipt or recording an actual refund). Source inventory checks establish this boundary; business services and API contracts did not change.

Final runtime inventory SHA-256: `9da817243862620645b11075320ece17c7d3eccc65b6ed4d648f734fa2e84374`. The per-file manifest is `.tools/ui-qa-final-source-inventory.json`. The final focused run re-exercises corrected cases and related dialog/financial/permission flows on a fresh `sporthost_ui_regression_test` database.

| Scenario | Assertions |
| --- | --- |
| Public/auth UI | Six requested widths; one h1; no horizontal overflow; password visible in viewport and show/hide control; skip link; validation; reduced-motion behavior; local navigation observation |
| Host UI | Active navigation including nested session; real club/member creation; invalid phone preserves entered name/phone; six widths across dashboard/clubs/schedule/members/finance/club; image type/size rejection; local preview and cleanup; failed HTML responses preserve input; real private QR save; modal focus/Escape/confirmation and actual cancellation |
| Host account/CLB | Signup → create CLB → change settings → refresh persistence → add member → change password → logout/login; native auth CSRF/cookie/303 contracts |
| Guest/group/attendance/billing | Guest registration/companions → approval → actual attendance → exact fee issue → partial receipt/refund/close with debt, including fifteen-player scenario |
| Cohost security | Check-in-only user cannot read contacts, finance, private links/media, CSV or RSC fields; explicit revoke confirmation and denied access afterward |
| Member launch journey | Signup/verification/linkage → open-session registration → host reject/reason → approve → private calendar → proof rejection/retry → confirmed receipt → password recovery; member screens at six requested widths |
| Member account scope | Invitations/RSVP, account-owned booking/dues/media, unlink revocation, private upload controls and status accuracy |
| Legacy routes/operations | Native member settings, cohost removal, monthly fees/proofs/toggles, recurring schedules, guest key edit/rotation/revocation, admin ledger and typed deletion isolation |
| Subscription UI | Owner/trial/promotion, safe disabled-payment configuration, forged webhook rejection and ignored forged return parameters; live checkout is not part of this local run |

## Earlier attempts and corrections

- The first targeted UI run completed public/auth checks and the six host widths, then failed because a broad `getByRole('alert')` also matched Next.js's route announcer. Assertions now scope to the main landmark. This was a test selector failure; its failed run is not counted as final acceptance.
- An intermediate full browser run was intentionally stopped while control contrast and cohost confirmation were finalized. It is not counted as completed acceptance.
- A repeated Windows build hit `EPERM` while removing a OneDrive-managed generated directory. Previous `.next` output was moved into ignored workspace storage after verifying both absolute paths. The subsequent build succeeded. No source, private configuration or database was deleted.
- Initial implementation checks caught unused imports and a renamed heading's mismatched closing tag; these were corrected before the successful build.
- The first full-run fifteen-player case stopped on the obsolete generic upload message “Đã lưu”; it now asserts the intentional “Đã gửi biên nhận” message and performs the new explicit receipt confirmation. Its financial balance assertions remain unchanged. The corrected case must pass on rerun before acceptance.
- One desktop native-forms attempt received `ECONNRESET` on an HTTP POST. It is recorded as a failed attempt, not silently retried inside the financial operation. A fresh isolated test rerun is required to distinguish a transient local connection failure from a reproducible regression.
- The new keyboard regression caught focus leaving the native dialog on Shift+Tab in Edge. An explicit two-button Tab/Shift+Tab cycle was implemented while retaining native modal/inert/Escape behavior. Both cycle directions, safe initial focus, Escape, focus return and actual submission must pass on the rebuilt revision.

## Main implementation files

| Files / area | Change and purpose |
| --- | --- |
| `src/app/globals.css`, `components/ui/{button,input,page-header,empty-state,status-badge,page-loading}.tsx` | Centralized surfaces/controls, contrast, wrapping, focus, semantic status and reusable page states |
| `src/app/(workspace)/layout.tsx`, `features/shared/workspace-navigation.tsx`, member layout/navigation | Labeled mobile host navigation, active nested sections, administrator visibility, Vietnam-time context and member safe areas |
| `src/app/page.tsx`, `features/auth/{auth-page,auth-form,account-form}.tsx` | Clear public host/player entry, compact mobile auth, accessible password visibility and failed-input handling |
| `src/app/(workspace)/{dashboard,clubs,schedule,members,finance,payments}`, `features/clubs/club-card.tsx` | Correct dedicated club inventory, useful onboarding/empty states, filter labels and responsive task layouts |
| `features/shared/{retained-action,action-form,image-picker,upload-form}` | Retain input after handled errors, consequence dialogs, upload preview/preflight, repeat-submit lock and truthful upload results |
| Guest/member payment pages, `features/bookings/guest-finance.tsx`, `features/finance/club-finance.tsx` | Authorized inline QR, consistent proof picker and pending-versus-received clarity |
| `domain/format.ts`, affected session/member/finance views | Vietnam wall-time presentation and Vietnamese date/period formatting without changing stored/API values |
| `server/modules/clubs/dashboard.ts` | Reuse already authorized clubs; existing business services otherwise preserved |
| `playwright.config.ts`, `tests/e2e/disposable-db.ts`, browser/unit tests | Fail-closed local database guard, matched app/fixture URL, targeted UI regressions and updated assertions for intentional confirmation/date changes |

All paths in this table are relative to `v2/`. Package manifests and lockfile are unchanged. The four requested documents and the superseded design reference complete the handoff.

## Reproduction

Use a disposable loopback database named `*_test`, configured development/test secrets and local media, and installed Microsoft Edge. Never point browser acceptance at production. The private existing `.env.local` does not need to be overwritten.

```powershell
cd v2
$env:SPORTHOST_TEST_DATABASE_URL = 'postgresql://<local-test-user>@127.0.0.1:<port>/<database>_test'
$env:DATABASE_URL = $env:SPORTHOST_TEST_DATABASE_URL
# Configure APP_ENV=test, a synthetic SECRET_KEY, local STORAGE_ROOT,
# APP_URL=http://127.0.0.1:3100, ALLOWED_HOSTS=127.0.0.1,localhost,
# COOKIE_SECURE=false, APP_READ_ONLY=false, EMAIL_ENABLED=false.
# For this report's disabled-checkout browser case, also set
# SPORTHOST_TEST_PAYMENTS_DISABLED=true and clear the three PAYOS_* keys.
npm run db:test:prepare
npm test
npm run typecheck
npm run build
npm run test:e2e
```

The ignored `.tools/ui-qa-run.mjs` retained in this workspace supplies these synthetic settings to child processes for the exact local environment. It also uses the existing local Node executable. A new machine should use its own local configuration and database rather than copying private environment files.

## Accessibility and performance limits

Calculated sRGB contrast: primary text on white 5.62:1; muted text on white 6.06:1; new control border on white 3.46:1 and on workspace 3.18:1. Keyboard modal behavior, visible focus, labels/status, reduced motion and overflow are exercised in browser acceptance. This is not a full WCAG 2.2 AA conformance certification. NVDA/VoiceOver, physical device keyboards, zoomed/reflow text and every color combination still need manual review.

The application keeps Server Components and local system fonts. The dedicated club inventory avoids dashboard finance loading; dashboard reuses its already authorized club query. No new runtime dependencies or third-party font/image requests were introduced. Image previews release object URLs; private QR images have dimensions and lazy loading. Existing media sanitization, bounded polling cleanup and server-side authorization were preserved.

Local navigation timings attached to the browser report are observations on this machine and may use a warm browser cache. They are not Lighthouse scores, mobile-network measurements, LCP/INP/CLS field evidence or proof of a Core Web Vitals pass. Large-club ledger/query scaling remains a follow-up requiring representative production-sized fixtures.

Observed public-page sample: at 1440px, 8 script resources / 152,291 encoded bytes; response start 12–34ms, DOMContentLoaded 99–148ms, first contentful paint 196–212ms across the two browser projects. Both samples were captured after the viewport loop ended at 1440px; they must not be relabeled as phone-network measurements. Raw observations are retained in `.tools/ui-qa-navigation.json` and in browser report attachments.

## Manual acceptance still required

1. Physical iPhone/Safari and Android browser: safe areas, native date/time picker, keyboard, image selection/camera permissions, QR readability and long Vietnamese names.
2. VoiceOver/NVDA and 200–400% zoom/reflow across primary tasks; contrast spot checks for less common states.
3. Real configured SMTP delivery to the supported mail clients; localhost SMTP acceptance cannot establish deliverability.
4. An operator-controlled real payOS settlement, cumulative renewal and host bank receipt/refund; screenshots, return URLs and provider test doubles do not prove real funds were received.
5. Slow mobile network and representative large-club data for field performance; this revision does not have real-user Core Web Vitals.

Final recommendation is recorded in `LAUNCH_UI_UX_CHECKLIST.md` after browser acceptance completes.

## Retained screenshot evidence

These captures use isolated synthetic QA records, not production/customer data. They demonstrate the unchanged visual implementation from the broad browser candidate; the final dialog correction changes keyboard handling only.

| Capture | File |
| --- | --- |
| Public entry, desktop | [public-desktop.png](ui-ux-evidence/public-desktop.png) |
| Login, 390px | [login-mobile.png](ui-ux-evidence/login-mobile.png) |
| Club setup, 390px | [club-mobile.png](ui-ux-evidence/club-mobile.png) |
| Club setup, 1440px | [club-desktop.png](ui-ux-evidence/club-desktop.png) |
| Member booking/payment, 390px | [member-booking-mobile.png](ui-ux-evidence/member-booking-mobile.png) |

Full-page captures include fixed navigation at the viewport position where the capture began. Additional six-width screenshots and failure traces remain under the ignored `v2/test-results/` directories.
