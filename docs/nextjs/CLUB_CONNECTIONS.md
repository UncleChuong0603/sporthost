# Club connection requests — UX round 2

This change adds an owner-approved onboarding path to the existing member portal. It is available on Free and Pro. The existing manual email linkage remains available.

## Player and owner flow

1. The owner opens **Members → Player connections**, or the connection entry on the club page, and creates a club invitation.
2. The public `/connect/:code` link takes the player through sign-in or signup while retaining the destination. Club details are shown after authentication.
3. The player verifies their email and submits their name and an optional message. This creates a pending request; it grants no member or host access.
4. The owner explicitly selects an unlinked member profile in that club before approving. Rejection requires a reason visible to the player. No profile is selected automatically or matched by name/phone.
5. The player can track requests at `/me/connect`, withdraw a pending request, or submit again after rejection/cancellation using an active invitation.

Only the club owner manages invitations and reviews requests. Managers, finance/check-in cohosts and other players cannot review them. Approval rechecks verification, suspension and current links in a transaction. Concurrent approvals cannot claim the same profile. Existing links must be removed explicitly before changing identity.

Owners can replace or disable their invitation. Old links stop accepting new requests; already pending requests remain available for review. Invitation codes are random, excluded from audit payloads and never grant access to member data. Player queries return only their own request history. Public invite pages use the application's no-referrer policy.

## Deployment

Apply `v2/migrations/0004_club_connections.sql` explicitly before releasing this runtime, after the existing member, payOS and admin migrations required by the current source tree. Startup does not migrate. The new SQL adds only `clubhost.club_connection_invites`, `clubhost.club_connection_requests`, their constraints and indexes. It does not rewrite existing account, member, booking or financial rows. It can be replayed. Readiness requires the new tables.

Use the existing release procedure: back up the intended database and media, restore to a disposable target, apply the SQL there, run regression, then apply to the named deployment target. The runtime role needs SELECT/INSERT/UPDATE/DELETE on both new tables and USAGE/SELECT on `clubhost.club_connection_requests_id_seq`. Use the actual restricted runtime role; do not grant schema/database creation.

Rollback restores the previous compatible application artifact while retaining the additive tables and newer business activity. Leave pending requests and links in place. Removing a request table does not revoke a member account link; owners revoke access through the existing explicit unlink action. Do not restore an older database over live transactions.

## Other UX fixes in this round

- Session creation preserves entered fields across club changes and returned business errors, updates untouched club defaults, focuses errors and opens collapsed sections for native validation.
- Session details and billing retain club navigation context; session billing marks Finance as current.
- Dashboard tasks include pending connection requests for owners and separate payer credit for users with financial permission. Credit does not cancel another payer's debt or automatically record a refund.

Automatic reminders, a notification inbox, checkout return-to-draft and editing future recurring sessions remain future work.

## Validation

Service tests cover verification, ownership, cross-club denial, duplicate submission, retries, withdrawal, rotation/disable, suspension, conflicting manual links and concurrent approvals. Browser cases cover draft retention after a real server validation error and the signup → request → reject → retry → approve flow on desktop and 375px mobile.

Local validation completed on 2026-11-14:

- All 22 Vitest suites passed: **236/236 tests**, using one worker and serialized files against an isolated loopback database. This includes the legacy schema compatibility checks.
- The production build passed, including TypeScript and the standalone artifact scan for private environment files, keys and test output.
- **18 desktop/mobile browser cases passed across focused runs**: 6 for connections, draft retention and host workflow; 4 for booking/billing and subscriptions; 8 for member onboarding, QR/proof upload, account recovery, native settings and cohost HTML/RSC privacy.
- Screenshots were inspected for desktop and 375px mobile. The new flow passed horizontal overflow checks. The additive migrations were replayed against the disposable test database.

The test candidate is frozen under the ignored `.vercel/nextjs/ux-round2-20261113/1794504266619/v2/` directory, with a separate database, upload directory and browser port 3116. UX runtime source and migration 0004 match the workspace. Later concurrent edits to the admin overview, admin table and migration 0003 are outside this validation record. No existing private workspace environment was overwritten.

Successful browser counts combine separate runs. The new connection test was fixed to wait for the owner's rejection/rotation to complete before opening the player page. An earlier regression run used an incorrectly escaped Windows upload path in the disposable environment; the corrected environment passed all eight affected cases. No application runtime change was needed for those test setup failures.

This document describes local implementation. It does not record a production deployment.
