# SportHost v2

One full-stack Next.js application. Backend behavior is implemented in TypeScript modules under `src/server/modules`, called by Server Actions and native legacy-form Route Handlers. There is no Python, FastAPI, Express, NestJS, paid authentication service or required object-storage SaaS in the target runtime.

Use Node 22.12+ and PostgreSQL. Copy `.env.example` to a private `.env.local`, install with `npm ci`, then run `npm run dev`. Configure an existing `clubhost` database at the reviewed Alembic 0011 baseline. Never run generated Drizzle CREATE SQL against production. The audit and acceptance gates are in `../docs/nextjs/sprint-0/`; current release evidence is in `../docs/nextjs/PROGRESS.md`.

For an empty disposable local test database, run `npm run db:test:prepare` first; the checked-in schema-only fixture replaces the retired Alembic bootstrap. OpenSSL 3+ is required for SMTP tests (`SPORTHOST_OPENSSL` can select its executable; Git for Windows is detected). Application tests do not invoke Python.

Run `npm test`, `npm run typecheck`, `npm run build`, then `npm run test:e2e`. Integration tests refuse remote databases and require a loopback database whose name ends with `_test`; use a disposable database, not production. Browser tests start the actual standalone Node server on port 3100 and currently use installed Microsoft Edge. Tests never send real email. A successful build also scans the artifact for env files, private keys, test outputs and Python files.

Production uses the Dockerfile in this directory, a persistent writable `/data/uploads` mount owned by UID/GID 10001, strict HTTPS configuration and the existing PostgreSQL database. The default internal port is 3000; existing Dokploy production uses `PORT=8000` to preserve its domain routing. Release gates passed and v2 is live at https://sporthost.online; see `../docs/nextjs/PROGRESS.md` and `../docs/nextjs/RELEASE_RUNBOOK.md` for evidence and rollback. Startup never runs migrations.

SMTP is configurable through `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` and `EMAIL_ENABLED`. TLS verification is required. Optional Resend support uses the same SMTP transport: explicitly set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`; `RESEND_API_KEY` may supply its password. A key alone never enables mail. No provider SDK is required, and any compatible SMTP server can replace it.

The player area starts at `/me` (signup/login at `/me/signup` and `/me/login`). It shares authentication but requires a verified email and explicit club-owner linkage to a member profile. Read `../docs/nextjs/MEMBER_PORTAL.md` for onboarding, authorization and the operator-applied additive migration `migrations/0001_member_accounts.sql`. Apply it to a disposable development/test database as well; the original 241-column baseline is preserved and readiness also checks the four new link columns. Startup never applies it.

Uploads are private. Both QR and bank text are snapshotted for existing obligations, and new images are removed if their database transaction fails. Uploaded payment screenshots remain reports until an authorized host explicitly reviews real received money. Issued charge snapshots are immutable; later changes use versioned adjustments and append-only money movements.

SportHost Pro uses payOS for per-club purchases: 7-day trial for new clubs, launch price 49,000 VND / 30 days (original 99,000 VND), verified automatic activation and cumulative renewal. Apply the additive `migrations/0002_payos_orders.sql` explicitly before deploying, configure server-only payOS keys, then register the public webhook. See [payment setup and recovery](../docs/nextjs/PAYMENTS.md). Local env keys are not automatically copied to production.
