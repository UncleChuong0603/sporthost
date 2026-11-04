# SportHost v2 implementation evidence

Sprint 0 is complete; the immutable source audit and phase gates are in `sprint-0/`. The implementation lives in `v2/`. Existing production has not been replaced, DNS has not been changed by this refactor, and production business records have not been mutated.

## Implemented locally

- Next.js App Router, React/TypeScript, Tailwind/shadcn controls, Drizzle mappings of all 241 existing `clubhost` columns, strict runtime configuration and standalone Node Docker target.
- Compatible PBKDF2 hashes, signed sessions/CSRF/guest capabilities, one-time email tokens, current role checks, contact/finance DTO boundaries, account/club/member/cohost flows.
- One-off/weekly schedules, invitations/RSVP, phone-first privacy, atomic group capacity and quotas, private-link rotation/revocation, lifecycle/attendance/walk-in/replacement.
- Exact integer-VND billing, accepted policies, monthly dues/overrides, GROUP/SPLIT, immutable issue snapshots, append-only receipt/refund/reversal, versioned adjustments, close with debt, independent platform ledger and legacy CSV columns.
- Private persistent PNG storage from bounded, decoded/re-encoded uploads; QR/bank snapshots retained together; manual proof review; upload rollback cleanup. No screenshot confirmation automation.
- All 30 audited GET paths exist. Native POST compatibility dispatcher covers the existing route families; complete behavior verification is still in progress. Route existence is not feature-parity acceptance.

## Verified so far (2026-11-04)

- `npm test`: 155 passing Vitest cases, including real isolated PostgreSQL races and rollback tests. Test URLs must be loopback and end in `_test`.
- `npm run typecheck`: passes.
- `npm run build`: passes; artifact scan rejects env/private-key/test-output/Python files. Runtime upload paths are excluded from static tracing.
- Desktop/mobile browser flows previously passed account/club/member/password and group booking → attendance → exact sharing → partial payment → close-with-debt. Native legacy forms/media and recent UI additions are being regression tested; do not claim all browser tests pass yet.
- Production read-only observation: `sporthost.online` resolves to `42.96.4.79`, but trusted HTTPS verification still fails. Existing Dokploy application remains `sporthost-production` with one replica and its Python runtime unchanged.
- VPS preflight: 4 CPUs, about 1.8 GiB available RAM and 23.9 GiB free disk at inspection. SSH user lacks direct Docker access; Dokploy API is available. Existing PostgreSQL role can create an isolated preview database. No preview Application/database has been created yet.

## Release gates still open

Finish regression of all legacy mutations and new controls; compare legacy Python and v2 financial fixtures; verify email with a local SMTP sink; finish runtime/media backup/restore checks; build/test a Linux Node-only image; provision the authorized isolated Dokploy preview; run complete parity and operational acceptance there. Only then prepare production activation and rollback with current data/media reconciliation.

Email transport is generic SMTP. Optional `RESEND_API_KEY` is used only when the explicit SMTP host is `smtp.resend.com` and user is `resend`; it never enables email by itself. User identifies root `.env.local` as the key location, but the saved file inspected so far contains no Resend/SMTP key. No real email has been sent.
