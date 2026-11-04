# Retained migration contracts

Sprint 0 audited the complete Python application before any feature rewrite on 2026-11-03. The migration and member releases are now live; use [current release evidence](../PROGRESS.md), [deployment and rollback](../RELEASE_RUNBOOK.md) and [cleanup scope](../CLEANUP.md) for current instructions.

These references remain useful for ongoing regression and security review:

- [ROUTE_PARITY.csv](ROUTE_PARITY.csv): the 89 independently audited legacy route contracts, consumed by route tests and HTTP evidence generation.
- [ARCHITECTURE.md](ARCHITECTURE.md): original module, transaction, permission and runtime design.
- [COMPATIBILITY.md](COMPATIBILITY.md): original database, password, session, guest URL and storage contracts.
- [ACCEPTANCE.md](ACCEPTANCE.md): feature parity, financial integrity, privacy and release acceptance criteria.

The three Markdown specifications describe the original migration baseline. Proposed tools, initial file layouts, pre-cutover status and source paths may have changed; current guides and implementation take precedence. Completed inventory, audit and migration-plan reports were privately archived and removed from the working tree at the owner's request. The route contract is intentionally retained independently of implementation.
