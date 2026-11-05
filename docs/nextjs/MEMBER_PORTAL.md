# SportHost member portal

The member area is part of the existing full-stack Next.js application. It uses the same self-hosted password/session implementation and PostgreSQL database, without a separate backend or authentication provider.

## Entry points and onboarding

1. A player opens `/me/signup`, creates an email/password account, then opens `/me/profile` to request and complete email verification. Existing accounts can sign in at `/me/login` with their existing password.
2. The club owner opens **Members**, expands **Player account** for the correct member, enters the player's verified account email and explicitly links it. A manager/finance/check-in cohost cannot make identity links.
3. The player opens `/me` to see their connected clubs, upcoming sessions, invitations and payments. At `/me/schedule`, they can also register directly for an open session in a linked club using the approved profile. A single account can have explicitly approved profiles in several clubs. No phone-number or name-based automatic matching occurs.
4. The owner can remove the link immediately. Changing an already linked identity requires unlinking first; it cannot silently replace an account. Link/unlink operations are audited.

An unverified or unlinked account sees onboarding, not another player's data. Existing guest links and registration without login are preserved.

## UI and behavior

- `/me`: personal overview, upcoming sessions, invitations, debt and linked clubs.
- `/me/schedule`: upcoming and historical registrations, including cancellations, with pagination; open sessions in linked clubs support direct registration with the existing capacity, waitlist, approval and deadline rules. Retries open the same booking.
- `/me/bookings/:id`: own group/attendance status, fixed-member RSVP, permitted guest-group edits/cancellation, payer mode, issued charges, adjustments, recorded movements, QR and proof upload.
- `/me/payments`: session and monthly obligations with pagination. Summary totals cover all pages. Separate payer credit never cancels another payer's debt. Draft cost-sharing amounts remain unknown until the host issues them.
- `/me/dues/:id`: own monthly payment instructions/QR and receipt submission.
- `/me/profile`: verified email, club-specific player profiles and password change. Club-specific name/phone/gender/kind/level remain managed by the host because they affect identity, capacity and fees.

Four labeled destinations use mobile bottom navigation with safe-area spacing and desktop top navigation. Existing teal design tokens, Vietnamese text, keyboard focus, at least 44px targets and meaningful empty states remain in use. The host login links to the player login, and the workspace can switch to player mode.

## Data and authorization

The legacy `hosts` physical table remains the shared account store; an account row alone grants no access to another club. A new `clubhost.member_account_links` table maps one verified account to each approved member profile, with an account lookup index and recorded linking actor/time. No existing business table or password hash is rewritten.

`src/server/modules/member-portal/` provides identity linkage, narrowly scoped read models and upload boundaries. Member actions derive account ID from the authenticated session, never from form fields. Every resource query/mutation rechecks the verified account and current link; unauthorized resource IDs return 404. Mutations hold the link stable until commit so concurrent unlinking cannot bypass authorization.

Authenticated resource IDs are used for member detail/QR/upload routes. The portal does not reveal or depend on stored guest bearer keys. Guest-link rotation/revocation remains separate from the owner's approved account relationship; unlink the account to revoke that relationship. Existing business services accept either the original guest capability or a checked account/member reference, sharing the same transaction, capacity, deadline, attendance and financial rules.

Screenshots only create reported proofs. They do not mark an obligation paid or append a receipt. Only an authorized host records actual money. Pages and media use private/no-store responses, and HTML/RSC privacy is covered by browser regression.

## Additive migration and rollback

Review `v2/migrations/0001_member_accounts.sql`. The operator tool checks the target database explicitly and defaults to inspection:

```powershell
.venv\Scripts\python.exe scripts\apply_nextjs_member_schema.py --env-file <private-env-path> --database <exact-database-name>
```

Add `--apply` only for the intended deployment target. The SQL creates one table and index; it never deletes or updates legacy rows. It retains Alembic `0011_fixed_member_fees`; readiness requires the original 241 columns plus the four new link columns. This is an explicit operator step, never application startup behavior. A restricted preview role needs CRUD privileges on the new table only; the tool supports that named role without granting database/schema creation.

Before production deployment, back up and restore the current database/media, test the migration on the copy and run regression. Rollback restores the previous compatible Next.js source/image with current environment and media volume. Leave the additive table in place and retain all newer business transactions; do not drop it or restore an old database dump over live activity.

## Validation record

Released on 2026-11-04 at <https://sporthost.online/me>. TypeScript/build checks and 188 Vitest cases pass, including last-seat authenticated RSVP, cross-account denial, verification/link revocation, separate credit/debt and proof submission without receipts. All 24 desktop/mobile browser cases passed locally and all 24 passed on the isolated Dokploy preview without retries in the final runs. Both environments retain HTTP evidence for all 89 original route contracts. The preview uses the same runtime image as production.

Fresh production backup SHA256 `1cd7aa9bedec214287c352accccd4629faad0d20890ea53f65d39970c5dba272` restored into a disposable local database; the additive migration and 188 regressions passed while preserving the original business/auth/audit rows and unrelated-schema sentinel. Production then received the new empty table and the tested application. All 22 original table hashes still match the backup after cutover; no original account or business row was rewritten. Production acceptance passed 36 HTTP/static/auth/authorization checks and 13 browser GET checks at desktop/375px without unsafe requests or page errors. No synthetic production accounts, registrations or financial records were created.

Production deployment `UFyCxKLQvVbUZPMF9Rbha` completed with image `sha256:f7289cbd43a1f583315eeb467f2973ade103e3b92245cbe60530296ff7b82681`. Source digest `a58ecd52cf87d23917a1df066d73386f01b3c9f2c55d5a502d8858378a8e67fd`; ZIP SHA256 `d755377355728acbed0673af6ab9ae218ebd5f4c47f89eb73991bfe58d88f1b8`. Preview deployment `i0SguO2Ch-iV8ZsBsjigN` completed on the same source. Existing SMTP, session signing key, database URL, production upload volume and port 8000 remain in place. No DNS changes or destructive migrations occurred. Private evidence is under `.vercel/nextjs/member-release-20261104/`.
