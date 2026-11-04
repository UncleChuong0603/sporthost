# SportHost

SportHost runs at https://sporthost.online. Hosts manage clubs, schedules, players and money; players use https://sporthost.online/me for their own invitations, registrations and payments.

The application is the single full-stack Next.js project in `v2/`: App Router, React, TypeScript, Tailwind/shadcn, Route Handlers/Server Actions, Drizzle ORM and PostgreSQL. Authentication and sessions are self-hosted. Private images live on the Dokploy VPS; email uses configurable SMTP. There is no FastAPI, separate backend, Blob SDK or Python application/test runtime.

## Development

Use Node 22.12+ and PostgreSQL 18. Copy `v2/.env.example` to a private `v2/.env.local` on a new checkout, configure its database and run:

```powershell
cd v2
npm ci
npm run dev
```

Never overwrite an existing private env file. The production database retains schema `clubhost` and the reviewed legacy revision `0011_fixed_member_fees`; the additive member-account table is applied explicitly by an operator. Application startup never migrates.

## Verification

Use a disposable loopback PostgreSQL database named `*_test`. After configuring its URL in the private env file:

```powershell
cd v2
npm run db:test:prepare
npm test
npm run typecheck
npm run build
npm run test:e2e
```

`db:test:prepare` initializes only an empty local test schema from a checked-in schema-only fixture, then adds the reviewed member table. It refuses remote/non-test targets and never replaces existing business tables. Tests require OpenSSL 3+ for a short-lived localhost SMTP certificate; Git for Windows' bundled OpenSSL is detected automatically, or set `SPORTHOST_OPENSSL`. Browser tests use installed Microsoft Edge. No real email is sent by tests.

Compatibility checks use independently captured Python password/session and billing fixtures. They no longer start Python or import the retired application. Existing guest URLs, native form POSTs and fixed-price bookings remain active product contracts.

## Deployment and operations

Build from `v2/`, for example `docker build --tag sporthost:v2 v2` from the repository root. Existing Dokploy production uses port 8000 and a private writable `/data/uploads` volume owned by UID/GID 10001. Keep the database URL, session signing key and persistent media across releases. Do not edit production DNS or run destructive migrations without approval.

The six operator commands under `scripts/` handle database/media backups, local restore verification, the reviewed additive schema change, Dokploy access and HTTP evidence. They are outside the application image. If needed, use Python 3.11+ to install their separate operator dependencies with `python -m pip install -r scripts/requirements.txt`; FastAPI, SQLAlchemy application models, Alembic and the old web runtime are not required. Backup tools use native PostgreSQL clients and a verified VPS-volume inventory.

- [Application setup](v2/README.md)
- [Member onboarding and permissions](docs/nextjs/MEMBER_PORTAL.md)
- [Current release evidence](docs/nextjs/PROGRESS.md)
- [Deployment and rollback](docs/nextjs/RELEASE_RUNBOOK.md)
- [Cleanup scope and retained compatibility](docs/nextjs/CLEANUP.md)

Earlier sprint reports and `docs/deployment/` are historical v1 evidence. Follow `docs/nextjs/` for current operations. Retired working-tree source was snapshotted privately before removal; immutable release images, backups, data, uploads and secrets were preserved.
