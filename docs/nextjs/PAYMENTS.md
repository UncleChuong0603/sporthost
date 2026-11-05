# SportHost Pro / payOS

Pro is purchased per club. New clubs receive 7 days of Pro automatically; existing
trial dates are preserved. The launch offer is 49,000 VND for 30 days, compared to
the original 99,000 VND (save 50,000 VND, approximately 51%). There is no automatic
renewal and no invented deadline or countdown. Pricing is centralized in
`v2/src/domain/subscription.ts`; every order snapshots its price and duration.

Checkout uses `SPORTHOST` as its nine-character transfer description so it also
works with the stricter limit for bank accounts without a direct payOS link.
See the `description` field in the [official API contract](https://payos.vn/docs/api/).

Core sessions, members, attendance, finance and existing records remain available
after expiry. Creating/generating/extending recurring schedules and granting or
updating cohost access require active trial/Pro at the server boundary. Existing
cohost access remains usable; access can always be revoked and schedules stopped.

Owners open **CLB → Gói Pro & thanh toán** at `/clubs/{id}/subscription` to purchase,
resume, check or cancel an order and see the latest 50 transactions. Only owners
can access billing. Each verified purchase extends the furthest of now, trial end
and paid end by 30 days. Cancellation is confirmed through payOS; returning with
`status=PAID` or any other query parameter cannot activate Pro.

## Runtime setup

1. Back up the target database and apply `v2/migrations/0002_payos_orders.sql`
   explicitly using the deployment operator's existing database connection. This
   adds one table and indexes, retains existing records and does not change the
   legacy revision. Startup never applies migrations. The runtime database role
   needs SELECT/INSERT/UPDATE on the table. `npm run db:test:prepare` applies it only
   to a disposable loopback test database.
2. Add `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` to the server's
   private runtime environment. Do not use `NEXT_PUBLIC_`, put keys in source, or
   copy `.env.local` into an image. Existing local credentials were configured in
   the ignored `v2/.env.local`; they are not automatically deployed to Dokploy.
3. Deploy the build with the canonical HTTPS `APP_URL`, allowlisted hostname and
   the migration already applied. Verify `/ready`. A release without the new table
   intentionally fails readiness. If credentials are missing, purchasing is
   unavailable and the pricing page explains this.
4. In the intended payOS channel, register the public webhook URL
   `https://sporthost.online/api/webhooks/payos` (or the deployed APP_URL plus that
   path). The official `webhooks.confirm(url)` SDK API can also register it after
   deployment. Registration sends a signed sample; unknown order codes are
   acknowledged without creating records. Keep any other channel's webhook intact.
5. Confirm registration, then do an operator-controlled real checkout and payment
   before declaring live settlement verified. Check Pro expiry, one platform ledger
   entry with request key `payos:{orderCode}`, and the activation audit log. The
   repository tests never charge real money or create live payment requests.

## Processing and recovery

The official `@payos/node` SDK signs requests and verifies provider response and
webhook signatures. All provider calls use the fixed official API origin, no SDK
logging, a 10-second timeout and no automatic retries. Checkout redirects accept
only approved HTTPS payOS hosts. The webhook body is limited to 32 KiB.

Checkout reserves one active order per club in a short transaction, then calls
payOS outside database locks. Repeated clicks reuse that code and a provider
timeout is reconciled using the same code. Links expire after 15 minutes. A lost
create response is recoverable by querying the order. An expired reservation that
payOS explicitly reports missing can be retired; an ambiguous network error cannot
generate a second payable order. Retry checkout after checking an expired order.

Webhook notifications and owner refresh/cancel all converge on the same processing
transaction. It validates order code, amount and provider link ID against persisted
values. A PAID response must contain enough money; partial/processing responses
remain pending. Locks serialize activation, order status, platform income and audit
creation. Duplicate notifications do not extend Pro or journal income twice.

The return page polls for up to a minute and offers manual checking. It never trusts
return URL parameters as evidence. The webhook retries through non-2xx responses
on transient provider/database failure. If a webhook is delayed, the owner's check
can settle the same verified order. APP_READ_ONLY blocks settlement mutations.

Financial orders survive explicit club deletion with a null club reference and
retained club name. If a delayed real payment arrives after deletion it is journaled
once for support follow-up, without activating another club. This is not a refund;
refunds require a separate operator process. No automatic refunds are implemented.

## Validation

Run `npm run db:test:prepare`, `npm test`, `npm run typecheck`, `npm run build`, then
`npx playwright test tests/e2e/subscription.spec.ts` from `v2/`. Tests use synthetic
payOS credentials/provider responses, real local PostgreSQL transactions, and SDK
HMAC verification. Browser checks cover trial/pricing, mobile overflow, forged return
parameters, invalid webhooks, expiry and anonymous billing access.

Official integration reference: https://payos.vn/docs/api/
