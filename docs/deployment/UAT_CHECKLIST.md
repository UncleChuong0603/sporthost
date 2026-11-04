# Acceptance evidence by environment

Latest owner scope: **one production Application; no dedicated staging or production write-based tests**. Synthetic tests run locally. Actual source backup/restore and upgraded-data old/current read probes passed; the approved production 0011 migration and real Dokploy deployment are complete. Final custom-domain TLS/activation awaits approved DNS.

| Plan criterion | Evidence | Remaining acceptance |
| --- | --- | --- |
| SSH / existing platform | Existing SSH and authorized Dokploy localhost API over SSH exec work | Exact installed platform version/server backup policy not independently certified |
| Preserve other apps | All eight pre-existing container IDs unchanged and running after two deployments | Continued observation |
| Runtime / internal port | Actual Docker build, non-root Python 3.12, internal 8000, healthy after redeploy | Production load capacity not measured |
| Environment / source identity | Existing secrets set; original signing key matches live Vercel CSRF; actual runtime flags verified; source ZIP/image recorded | Current live Vercel SHA unavailable; Git/webhook automation optional |
| PostgreSQL / records | Owner-confirmed Neon, TLS source, 0011 approved/applied; 21 business-table old-column hashes unchanged | No write-based production connectivity test |
| Read-only preview | Unsafe methods blocked; PostgreSQL default read-only sessions; real readiness passes | Enable writes only at approved activation |
| Health/static/errors | Temporary URL 9/9 GET: expected health/ready/static/error/auth/mail-disabled statuses | Continued 5xx/restart observation |
| HTTPS / canonical / proxy | Apex/www routes configured; HTTP301 to HTTPS; exact proxy CIDR verified; local CSRF/cookie tests | Valid public certificates and canonical HTTPS www redirect after DNS |
| Login/logout/session | Synthetic auth/session tests; live signing-key compatibility | Production login POST intentionally excluded; cross-domain browser cookies do not transfer |
| Clubs/co-hosts/tenant permissions | Existing synthetic club/settings/tenant tests | Production mutations excluded |
| Session/guest/group approval | Existing synthetic guest/group booking tests | Production signup/approval fixtures excluded |
| Attendance/cost/finance | Existing synthetic attendance/closing/billing tests | Production financial/attendance tests excluded |
| QR/private payment proof | Synthetic validation/access tests; private source Blob listing/archive verified empty | No existing real object to read; production upload test excluded |
| Durable uploads | Local private upload survived separate-process restart; actual app retains external Blob through redeploy | No fabricated production upload; local backend not selected |
| Rate limiting/client IP | Existing limiter retained; isolated test buckets; actual overlay CIDR trusted | Multiple external-client spoof/load probe not performed |
| Resend | Adapter/mocked error/retry/idempotency/disabled tests pass; actual EMAIL_ENABLED=false/key absent | Dashboard exact DNS/Verified, scoped key and approved delivery test |
| Backup / restore | Fresh native 22-table backup and local restore/migration pass; process stopped; hashes preserved | Scheduled encrypted off-site retention/PITR not configured/certified |
| Cron/queues/webhooks | None declared in source/Vercel config; no new schedules | External dashboard schedules not fully inventoried |
| Resources/logs | VPS snapshot, successful build/redeploy and container health; no app public bindings | Load test/alert pipeline/long-term resources not established |
| DNS/external network | Concrete verified-destination private change sheet; temporary external GET pass | Zone export, DNS/TTL approval/change, TLS/AAAA/proxy convergence |
| Operations/rollback | Native ZIP update works, runbook and Vercel fallback ready | Backup/monitoring ownership, observation window, separate retirement approval |

Latest full regression: **135 passed / 11 skipped** on Python 3.12; subsequent overlapping helper/runtime subset **26 passed**. Earlier synthetic browser suite: **10 passed**. See MIGRATION_REPORT and private JUnit artifacts for scope. These results do not claim full production write UAT or real Resend delivery.

Never attach credentials, guest capabilities, reset links, receipts or env values to reports. Do not restore over live production, create synthetic production tenants or remove the read-only guard to make preview tests pass.
