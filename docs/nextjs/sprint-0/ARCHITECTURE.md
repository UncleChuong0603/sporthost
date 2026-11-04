# Target TypeScript architecture

One full-stack Next.js App Router application, React + TypeScript, Node runtime, PostgreSQL through Drizzle. No Python, FastAPI, Express, NestJS, API gateway or separately deployed backend in the target. The legacy application stays available as a regression reference and production fallback until cutover acceptance.

## Repository layout and boundaries

Initially build under `v2/` to avoid the existing Python `app/` collision and accidental Dokploy Dockerfile replacement. This is a temporary repository layout, not an extra service dependency. Final image is built from the Next.js project alone. Keep legacy Python history/source out of that image.

```text
v2/
  src/app/                   # layouts, pages, actions, thin Route Handlers
    (auth)/                 # login/signup/account reset and verification UI
    (workspace)/            # dashboard/clubs/schedule/members/finance/admin
    (guest)/                # join/[publicId], attend/[key], dues/pay/[key]
    health/route.ts
    ready/route.ts
  src/components/ui/        # shadcn/ui source, semantic tokens, shared controls
  src/features/             # feature forms and client widgets; no DB access
  src/server/
    auth/                   # password verification, signed session, CSRF, email tokens
    access/                 # tenant-scoped capability checks and DTO projections
    db/                     # validated pg pool, pgSchema('clubhost'), transactions
    modules/
      clubs/ members/ scheduling/ bookings/ attendance/
      billing/ payments/ dues/ workspace/ platform-ledger/
    infrastructure/         # private volume, image processing, SMTP, clock, rate limits
    compatibility/          # bounded ItsDangerous decoder, old form/link adapters
  src/domain/               # pure SportHost money/policy/capacity/phone algorithms
  src/lib/                  # shared Zod schemas and presentation helpers
  tests/unit/               # Vitest pure algorithms and crypto fixtures
  tests/integration/        # real disposable PostgreSQL transactions/routes
  tests/e2e/                # Playwright, mobile + desktop, no production credentials
  scripts/                  # TypeScript DB/media probes, backup/release operator tools
  drizzle/                  # reviewed additive SQL and baseline metadata
  Dockerfile                # Next standalone multi-stage build; no startup migration
```

Each domain module owns `queries.ts` (permission-scoped read DTOs), `service.ts` (transactional commands), `schemas.ts` (Zod input/contract), and narrowly scoped repository helpers where necessary. Business rules belong to our TypeScript, never component event handlers or third-party SaaS functions. Server-only modules explicitly import `server-only`; browser code never imports server env, DB, email or secret material.

Server Components call query services directly. Internal server reads must not loop through this app's HTTP endpoints. Server Actions support new UI mutations; Route Handlers support stable legacy POST form contracts, private images, CSV and optional TanStack Query read endpoints. Both call the **same** service layer and validate identity, capability, input and origin/CSRF at their boundary. Framework guidance also requires authorization within each server mutation: [Next server functions](https://nextjs.org/docs/app/getting-started/mutating-data).

Use React Hook Form + Zod for interactive forms; revalidate all input on the server. Use TanStack Query only for live roster/review refresh and interactive queries where it improves freshness; never optimistic success for capacity, billing or payment confirmation. Server result is authoritative; present 409 stale version with a refresh/review action. Query keys include tenant/entity and clear on logout; never cache private responses publicly.

## Transactions and concurrency

Use a bounded `pg` pool with TLS and explicit timeouts. Drizzle transaction callback owns all SQL for one command. Never send part of a command through the global pool while a transaction is active. PostgreSQL remains the final arbiter with original unique/check/FK constraints.

| Operation | Serialization and atomic writes |
| --- | --- |
| Join, approve/cancel, RSVP, group edit, replacement, attendance, walk-in | Lock `game_sessions` first, then any club/contact lookup lock required by the existing flow, then booking/participant rows. Re-read state after lock; evaluate all participants/quotas and deadlines; write booking+participants+snapshots+audit together. Global lock-order review before cross-domain changes. |
| Issue, money, proof review for booking, close, adjustment | Lock session first; lock/refetch target; validate draft hash/version/idempotency; append charge/money/adjustment and audit plus compatibility flags in the same transaction. |
| Monthly bulk | Lock club then check unique member/period; preserve amount/payment snapshot. |
| Monthly proof review | Lock due then proof; validate report state and tenant; record explicit host decision atomically. |
| Recurring generation | Lock recurring rule, check occurrence unique key; insert each occurrence/invites/snapshots atomically. No scheduled background generator added. |
| Account reset/change | Lock host and one-use token as appropriate, update hash/version and used state atomically. |
| Platform ledger | Admin host lock for idempotent create; ledger entry lock/version check for edit; no club writes. |

All transactional failures roll back audit and balances along with primary writes. Recognized deadlocks/serialization failures get bounded retries only for idempotent commands. A retry after commit-response loss must return the same receipt, never a second receipt. Idempotency keys compare the meaningful original payload; reused key with changed payer/amount/kind/source/proof/reversal is 409.

Money stays integer VND: validated individual amounts ≤100,000,000; signed movements; no `parseFloat`, decimal rounding, or boolean-as-ledger shortcut. Aggregate arithmetic must remain within safe integer bounds (or use bigint at the boundary and serialize explicitly). COST_SHARING sorts participant IDs, divides allocated expense exactly, distributes remainder deterministically; snapshots must reproduce legacy canonical UTF-8 sorted-key JSON and SHA256 for equivalent drafts.

## Identity, privacy and compatibility

S1 starts with byte-compatible PBKDF2 and signed/versioned cookie sessions; a DB session store is optional later, not required for preserving accounts. Self-hosted authentication lives in this codebase. Keep the existing signing key as a runtime secret for guest capabilities and legacy-cookie verification; no key rotation on deployment. Node crypto APIs provide the primitives: [Node crypto](https://nodejs.org/api/crypto.html).

New password hashes can initially keep the existing format for bidirectional rollback. Versioned stronger hashes/rehashing require a reviewed rollback-compatible strategy; do not unilaterally rehash accounts into a format fallback Python cannot read. No mandatory resets.

Every read service returns explicit role-scoped DTOs: check-in sees roster and attendance, not phone/payment/private links; finance sees finance/contact data but not unauthorized private-link administration; guest capability sees only its own booking/payers. Check HTML, RSC payloads, JSON, images, CSV and errors. Never pass ORM rows wholesale to client components.

Private pages/handlers return `private, no-store`, capability/reset pages also `Referrer-Policy: no-referrer`. Never log raw secret URLs, tokens, password input, SQL parameters, SMTP messages or media bytes. Traefik logging rules must account for capability paths too. App origin and trusted proxy headers are validated; opaque request IDs can be logged safely.

## Next routing details

The manifest specifies all 89 method/path contracts. Preserve guest paths exactly, including `?source=facebook`. GET page + POST at the **same segment cannot use both `page.tsx` and `route.ts` there**. Use narrowly scoped Next rewrites for legacy POSTs to internal Route Handlers, or a complete Route Handler when appropriate; prefer POST rewrites for signup/login/join/clubs/settings/account reset routes. Server Actions use separate framework POST transport. Routing precedence must be tested so `/dues/pay/...` never matches `/dues/[dueId]` and literal booking subpaths outrank `[action]`.

Compatibility handlers parse form/multipart names from the source inventory, validate with Zod, call the shared service and preserve successful 303 redirects/error behavior. No HTTP redirect of sensitive POST bodies to another origin. Legacy form/CSRF requests do not bypass authorization merely because new UI uses Server Actions.

## Media/mail and deployment

User selected persistent VPS volume and SMTP. Private image storage preserves `clubs/{clubId}/{kind}/{key}.png`, unguessable names, SHA256, safe resolved paths and permissioned delivery. Use `sharp` for decode/MIME verification/pixel limits/metadata stripping/re-encode; file-size streaming limits must also handle absent Content-Length. Handle orphan cleanup and DB rollback. No static mount for private files. SMTP configuration validated at runtime; disabled/unconfigured mail returns truthful unavailable state. Do not send a verification/reset link before its token transaction is durable; use a database outbox if retries are introduced (additive migration reviewed separately).

Next standalone Docker, one app process/replica initially, UID 10001, internal port 3000, no public database/app port, Traefik HTTPS, `/health` without DB and `/ready` with read-only schema/access checks. Build without production DB/SMTP/secrets. At runtime use env and mounted data; no credentials baked into `NEXT_PUBLIC_*`, build arguments or static output. This is standard self-hosting: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Docker Next guide](https://docs.docker.com/guides/nextjs/).

Preview uses a separate Application, database and volume. A preview cannot write to production or send real mail by inheriting prod env. Production Dockerfile/source/domain remain untouched until release gates. Final v2 image includes no Python interpreter, Alembic, FastAPI, old templates or subprocess bridge. Operator PostgreSQL native tools may run separately; they are not a backend service.
