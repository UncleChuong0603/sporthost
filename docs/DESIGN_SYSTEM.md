# SportHost design system

Updated 2026-11-07. Applies to the full-stack Next.js application in `v2/`. Runtime tokens live in `v2/src/app/globals.css`; components use Tailwind utilities mapped to those variables. No downloaded font, image service or new runtime dependency is required.

## Foundations

| Token | Value | Use |
| --- | --- | --- |
| Primary | `#087563` | Main action, links, selected controls, focus |
| Primary foreground | `#ffffff` | Text on primary buttons |
| Sidebar | `#142d35` | Host navigation, member/auth identity |
| Foreground | `#182d35` | Headings and body |
| Muted foreground | `#536570` | Supporting text |
| Workspace | `#f3f6f7` | Page background |
| Surface | `#ffffff` | Cards, controls and dialogs |
| Border | `#dce4e8` | Surface and field separation |
| Control border | `#7a8d95` | Distinguishable field boundaries on white and muted surfaces |
| Destructive | `#b42318` | Destructive controls and error text |
| Success surface | `#edf8f3` | Success messages |
| Warning surface | `#fff7e6` | Attention and pending states |

System font stack: Segoe UI, Arial, Helvetica, sans-serif, with native Vietnamese coverage. Body line height 1.6; headings 1.3. Form inputs are at least 16px, avoiding mobile keyboard zoom. Supporting labels 12–14px, body 14–16px, card headings 18–20px, page headings 30–36px. Use tabular numerals for amounts. No decorative metrics.

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48px. Controls: 12px radius. Cards: 16px. Dialogs: 20px. Cards use a restrained `0 2px 8px rgb(20 45 53 / .035)` shadow; borders provide primary separation. Icons use the existing Lucide set, generally 16–24px; decorative icons have `aria-hidden`.

## Shared components

- `Button`: primary, outline, ghost and destructive variants; minimum 44px target, wrapping text, visible keyboard focus, disabled and pending feedback.
- `Input`: 48px high, 16px text, full available width, explicit labels, invalid/focus states. Native date/time/month controls keep stored values unchanged. Labels wrap their field or use matching `htmlFor`/`id`.
- `PageHeader`: single h1, concise intent, optional back link and primary action.
- `EmptyState`: explains absence and the next useful action; filtered lists offer reset without discarding records.
- `StatusBadge`: includes a readable label and semantic color. Confirmed/open uses teal; pending/waitlist/reported uses amber; invitations/in-progress blue; rejected red; cancelled neutral. Never use color alone.
- `PageLoading`: announced loading status and nonverbal skeletons; animation respects reduced motion.
- `ActionForm`: announces results, blocks repeated submissions, preserves values after handled errors, supports native accessible confirmation dialogs.
- `ImagePicker` / `UploadForm`: PNG/JPEG/WebP, QR ≤2 MB, proof ≤3 MB, labeled local preview, removable selection, actionable transport errors. Object URLs are released on replacement/unmount. Server sanitization is still required.
- `ClubCard`: real club name, sport, location, owner/cohost role and link to club management.

## Layout and responsive behavior

Host: 256px sidebar from 1024px, labeled two-row navigation on narrower screens, one main content region, content capped at 1280px. Current section uses `aria-current`, including nested club/session/billing/proof pages. Host email remains private to the authenticated shell. Administration links only render for platform administrators.

Member: content capped at 1024px, four labeled bottom destinations on narrow phones and a horizontal navigation strip from 640px. Bottom padding includes safe areas and leaves space for the navigation. The public registration page does not inherit host navigation.

Forms and lists: one column on phones; two columns from 640px; denser grids only when useful. Filter controls fill their grid columns. Rows use wrapping labels/actions and move secondary information below the title. Financial lists remain card/list based rather than introducing wide tables. Long Vietnamese names, account numbers and URLs wrap without clipping.

Viewport acceptance targets: 360, 390, 430, 768, 1024, 1440px. A browser viewport is not evidence for a physical iOS or Android device; see the QA report.

## Interaction and content

Vietnamese copy is concise and task specific. Distinguish fixed members (Cố định), casual members (Vãng lai), pending registration (Chờ duyệt), confirmed seat (Đã xác nhận), payment proof (Biên nhận chờ đối soát), and real receipts (Đã ghi nhận). No new backend states are created by presentation components.

Amounts use the existing `moneyText` contract, e.g. `70.000đ`. Session dates display `dd/mm/yyyy`, with 24-hour time and explicit Vietnam UTC+7 context. `domain/format.ts` interprets stored session timestamps as Vietnam wall time; it does not change scheduling or calendar export values. UTC/offset audit timestamps convert to Vietnam for display when using this helper. Period inputs keep `yyyy-mm` for native controls.

On failure, retain user input in memory and give a recovery action. Do not store passwords, bank details or proof previews in localStorage. A submitted payment proof must never announce a confirmed payment. Financial changes retain existing version/request-key checks and immutable history.

Destructive/irreversible actions explain consequences before submission. Dialogs use native modal/inert behavior with an explicit Tab/Shift+Tab cycle for their two buttons, focus the safe action first, close with Escape, and return focus to the initiating control. Club deletion additionally retains the existing server-validated club-name confirmation. Inline disclosures use a consistent plus/minus indicator. Focus outlines remain visible; reduced-motion users receive immediate state changes.

## Verification limits

This system targets WCAG 2.2 AA, but a component review alone is not a conformance audit. Screen-reader, physical-device, Safari and real-network checks must be assessed separately. See `UI_UX_QA_REPORT.md` for actual evidence.
