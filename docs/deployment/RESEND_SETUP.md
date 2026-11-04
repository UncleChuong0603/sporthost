# Resend — prepared, disabled

Current status: RESEND_API_KEY **missing**; no authenticated Resend dashboard access, sending domain status **unknown**, exact DNS records **not available**, no real delivery test performed. EMAIL_ENABLED=false is the deployment default. No API key, account or DNS record has been created.

## Owner configuration

1. In the owner's Resend Dashboard -> Domains, select the actual sending domain (sporthost.online or an owner-chosen subdomain). Copy/export the exact **sending** DNS record names, types, values, priorities and TTLs privately. Check whether status is Verified or Pending. Do not use example records as real DNS values.
2. Review the existing DNS zone before adding anything. Keep website A/AAAA/CNAME separate from sending-domain verification. Do not replace apex receiving MX, merge/overwrite an existing SPF incorrectly, or replace current DMARC. Current observed _dmarc TXT is `v=DMARC1; p=none;` with TTL 1800; confirm it again before any approved edit. A sending return-path MX requested by Resend is not an instruction to redirect the domain's incoming mail.
3. After reviewing the exact dashboard change set, obtain approval for DNS edits; add only those exact records in the authoritative account. Re-check in Resend until **Verified**. Dashboard-only DNS values cannot be inferred from this repo or from public lookups; this acceptance remains blocked until access/export is available.
4. Owner creates a **Sending access** API key, restricted to the sending domain if supported. Enter RESEND_API_KEY directly into Dokploy Environment/approved secret storage; never paste it into chat, Git, a URL or build args.
5. Set EMAIL_PROVIDER=resend, EMAIL_FROM to the exact verified sender identity, APP_URL to https://sporthost.online. No dedicated staging is required in the latest deployment scope. Keep EMAIL_ENABLED=false for now. After the key/domain are verified, test sending only with an explicitly owner-approved recipient and approval to enable email on the same production application.

DNS record worksheet (unfilled intentionally):

| Type/name/value/priority/TTL from Resend | Status |
| --- | --- |
| DKIM record(s) | Awaiting exact dashboard export |
| Sending return-path SPF/MX if requested | Awaiting exact dashboard export |
| Other required verification record | Awaiting exact dashboard export |
| Domain verification | Unknown, not claimed Verified |

## Application behavior

`app/mail.py` isolates delivery from account route logic; existing verification and password-reset events use it. No registration/approval notification previously existed and none was introduced. Successful API acceptance is not proof of inbox delivery. Unsuccessful/missing configuration returns 503 and never displays a successful send state.

EMAIL_ENABLED=false disables both providers. Verification on the account page shows the existing unavailable message. GET and POST password recovery are blocked clearly in staging/production until mail is ready; password changes in an authenticated account remain available. Existing verification/admin rules remain in force; do not manually mark users verified or grant admin as a mail workaround. When introducing Resend, remove unused SMTP settings or keep EMAIL_PROVIDER explicitly set to avoid unintended provider selection.

Resend sends use HTTPS POST /emails, a five-second HTTP operation timeout, up to three attempts for transport failures, 429 and 5xx; retries preserve a SHA256 idempotency key derived from the exact payload. Requested Retry-After over two seconds is returned as an unavailable service instead of making a web worker wait or retrying too early. Other 4xx and malformed success responses fail without retry. No provider response body, recipient, content, token or credential is logged. SMTP remains compatible when EMAIL_ENABLED is absent and the pre-existing SMTP config is complete; Dokploy explicitly sets false. SMTP errors are sanitized and are not blindly retried.

Delivery stays synchronous for verification/reset so failures roll back the uncommitted token transaction and cannot claim success before provider acceptance. No background worker/outbox database migration was added. Retries of the same payload are deduplicated by Resend for 24 hours; a later user action creates a new token/message. There is no durable cross-request exactly-once delivery guarantee. If a delivery is accepted but the DB commit fails, that link may be unusable; request a fresh link. Non-account club/booking/payment requests do not depend on email availability.

## Verification once enabled

- [ ] Dashboard shows Verified and sending key scope is correct; exact DNS answers match the dashboard.
- [ ] After separate authorization to enable mail/test delivery, an owner-approved recipient receives a link for the correct HTTPS origin; verify normal one-use/expiry behavior and that no raw token appears in logs. No sending test runs during read-only preview.
- [ ] Password reset link uses the correct origin, is one-use, invalidates old sessions; unknown email response does not disclose account existence.
- [ ] Inspect Resend delivery events and inbox/spam; API acceptance alone is insufficient.
- [ ] Simulated provider auth error, 429, 5xx, timeout and malformed response do not expose data or produce false success; bounded retries keep the same key.
- [ ] EMAIL_ENABLED=false blocks send/reset truthfully without affecting host/guest booking/payment flows.

Mocked provider/disabled tests are included in `tests/test_dokploy.py`; real delivery remains blocked. Turn EMAIL_ENABLED=false and redeploy if delivery fails; rotate keys through Dokploy and the owner-controlled Resend account.

Official references checked: [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys). Exact domain DNS values must come from the owner's dashboard.
