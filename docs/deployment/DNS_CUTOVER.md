# DNS / HTTPS cutover - approval still required

Updated 2026-11-03 (Asia/Bangkok). The single Dokploy production Application is deployed, healthy and passed 9/9 anonymous temporary-domain GET checks in APP_READ_ONLY=true mode. The owner-confirmed production database has the approved 0011 migration, with verified pre-change backup/restore and unchanged legacy data. Vercel remains live.

**No DNS/TTL change, normal-write activation or Vercel retirement is approved.** Domain/HTTPS routes are configured in Dokploy; public certificate validation is pending DNS.

## Current DNS observations and concrete change sheet

Latest read-only resolver snapshot: private .vercel/dokploy/dns-before-cutover.private.json, refreshed 2026-11-03.

| Name/type | Observed result | Earlier observed TTL |
| --- | --- | --- |
| sporthost.online NS | launch1.spaceship.net, launch2.spaceship.net | 1800 |
| sporthost.online A | NODATA | no A TTL |
| sporthost.online AAAA | NODATA | no AAAA TTL |
| sporthost.online MX | NODATA | no MX TTL |
| sporthost.online TXT | NODATA | no TXT TTL |
| www.sporthost.online CNAME | no answer; initial query NXDOMAIN | no record TTL |
| _dmarc.sporthost.online TXT | v=DMARC1; p=none; | 1800 |

Nameservers indicate Spaceship authoritative hosting. Account access, full authoritative zone export, DNSSEC/proxy configuration and registrar ownership have not been certified. These resolver observations are not a zone export. Preserve exact owner-exported values/TTLs before editing. Resend selectors/return-path records must come from its dashboard, not missing apex records.

The concrete private change sheet is **.vercel/dokploy/dns-cutover.private.json**. Destination IPv4 was independently cross-checked between the SSH target's resolved address and Dokploy's generated temporary hostname. Public IP is intentionally omitted from tracked docs; confirm it against the VPS account before approval. No IPv6 service is verified.

| Website record | Prepared action after approval |
| --- | --- |
| A @ | Verified VPS IPv4 in private change sheet |
| CNAME www | sporthost.online |
| AAAA apex/www | Do not add unverified IPv6; any conflicting existing record needs explicit review |
| TTL | Propose 300 during cutover, provider permitting |
| MX/TXT/DKIM/DMARC | Preserve existing values; handle Resend separately |

## Readiness and approval gates

- [x] Actual single Application healthy; Dockerfile/context/8000, image/source identity recorded.
- [x] Existing DB/schema owner-confirmed; approved migration 0011 applied after fresh verified native backup/restore.
- [x] Same existing private Blob retained; no store split or ephemeral upload storage.
- [x] Actual proxy network trust verified, no public app/DB port mapping.
- [x] Temporary-domain external anonymous GET 9/9; no production write UAT.
- [x] Eight pre-existing containers preserved and running; no shared proxy/firewall change.
- [x] Resend remains disabled, missing key reported truthfully.
- [x] Apex/www Dokploy Domains configured for port 8000, HTTPS/Let's Encrypt; HTTP redirects verified.
- [ ] Owner exports/confirms full authoritative old zone/TTLs and verified destination in VPS account.
- [ ] Agree rollback owner, observation period and exact point of APP_READ_ONLY=false activation; obtain explicit approval for DNS/TTL and activation.
- [ ] Refresh DB/media backup before cutover if live writes occurred.
- [ ] Apply approved website records, verify public DNS and valid apex/www TLS.
- [ ] External production HTTPS GET checks/logs/resources pass before normal-write activation.

The exact current Vercel SHA is unavailable (API auth 403). Documented release 8ee0239 passed upgraded local-data probes, and live Vercel health/ready/existing public session reads pass after 0011. No external scheduled writer inventory is available; source/Vercel config declares no cron/queue. Do not introduce duplicate jobs.

## Cutover procedure after explicit approval

1. Save the owner's old zone export and confirmed VPS destination; refresh the verified DB/media backup as needed. Keep Vercel deployment/settings and direct fallback https://sporthost.vercel.app.
2. Keep this Dokploy app read-only while changing only approved website records. Preserve mail records. Lower TTL only if approved; account for existing/negative caches and wait for authoritative/public convergence.
3. Let existing Dokploy/Traefik issue apex/www certificates. Inspect this app's domain/deployment logs. Verify strict TLS chain/hostname and HTTP -> HTTPS; do not bypass certificates or disable HTTPS.
4. Run external GET-only smoke and canonical redirect checks:

```powershell
python -m scripts.dokploy_smoke https://sporthost.online --expect-email-disabled
curl.exe -I http://sporthost.online
curl.exe -I https://www.sporthost.online
```

5. If certificates/routes/health fail, keep writes disabled, investigate or execute approved traffic rollback. No production login/signup/upload/financial test is authorized.
6. At the agreed activation point, patch only this app's APP_READ_ONLY=false and redeploy the tested artifact; recheck readiness and non-mutating GET routes/logs. Keep EMAIL_ENABLED=false. Old/new code share DB/Blob; drain old entry traffic if practical without disabling Vercel prematurely.
7. Observe 5xx/login errors, real user issues, OOM/restarts, DB, storage, disk/swap and TLS. Proposed observation at least 48 hours; owner chooses. Monitoring automation is not configured.

## Rollback

Restore the **exact approved old DNS values** and keep Vercel available. Current observations contain no apex A/AAAA/www CNAME: restoring those absences does not make the custom domain serve Vercel. The known working fallback is https://sporthost.vercel.app. If a working prior custom-domain Vercel configuration is desired, obtain and verify its exact record targets/domain assignment from the owner/Vercel before cutover; never invent a Vercel IP.

Set the failing SportHost app read-only if needed and route users to the known-good deployment. Preserve transactions written after cutover. DNS rollback does not reverse migrations; 0011 remains in place and its destructive downgrade is refused. Do not restore an old DB or drop columns automatically. Any recovery involving production data needs a separate reviewed decision.

Only retire Vercel after successful observation and separate owner approval. Preserve private Blob regardless of compute retirement.
