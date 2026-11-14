# Host productivity and activation

## Supported behavior

- **Excel members (Free):** `/members?club_id=…` shows a blank `.xlsx` template and a preview/confirm importer for authorized member managers. It reads the first sheet, up to 500 member rows / 32 columns, 2 MB compressed, with bounded expanded contents. Vietnamese headers are accepted; name and phone are required, other columns are optional. The template formats phones as text and supplies type/gender choices. Numeric nine-digit Vietnamese mobile cells receive their leading zero with a visible note.
- Each row is reported as ready, invalid or duplicate. Duplicate numbers use the existing normalized phone contract, including `+84` aliases. Existing records are never overwritten. Importing just the valid rows requires explicit acknowledgment when errors/duplicates exist. Profiles are never linked to accounts by name, phone or email.
- The server reparses the original file on confirmation, checks its signature-bound preview (account, club, file hash, normalized rows and current duplicates), verifies permissions again and locks the club using the same lock as manual member creation. Changed data or a replay requires a fresh preview. Accepted rows commit atomically. Files and preview data are not persisted or logged.
- Encrypted, macro/embedded-object/external-data, formula, malformed, oversized or sparse over-limit workbooks are rejected before the reader. Cells are treated as values, never evaluated. `.xls` is intentionally unsupported; save it as `.xlsx` in Excel. For formulas, paste values into the template. The ZIP validator bounds actual inflation and rejects DTD/entity declarations, unsafe entry names and huge sheet coordinates.
- **Copy session (Free):** `Sao chép thành buổi mới` links an authorized session manager to `/schedule/new?source_id=…`. It copies only the allowlisted title, venue, capacity, fees, fee mode and participation policy fields, including explicit zero fees. Dates/deadlines are empty; recurrence starts at one week. The source club is fixed for that form. The host reviews and submits the normal create action. Existing create validation and Pro checks still apply if the host explicitly chooses recurrence. Bookings, identities/capability URLs, attendance, proofs, charges, payments and session lifecycle are never copied. Reading a copy form creates no records.
- **Activation measurement:** `/admin/onboarding` is platform-admin-only and provides 7/30/90-day cohorts by first welcome observation, with start/explore-later choices and real club → session → share milestones. The first newly created club is pinned to the cohort; other clubs do not advance it. Club/session milestones commit inside the business transaction; rollback rolls them back. Share is a browser-success receipt validated by the existing server boundary and does not prove recipient delivery. Views do not complete tutorial missions.

## Data and dependencies

Deploy existing `0006_host_onboarding.sql` plus additive `0007_host_activation.sql` before this source. The latter stores only internal account/club IDs and first-observed milestone timestamps, with account deletion cascading. No historical funnel values are backfilled and no contact details, file contents or external analytics are collected. Cohort counts represent observations from feature activation onward; start/dismiss are choices and do not gate users who continue through the product directly. Deleted clubs retain historical timestamps but lose their FK; they cannot be replaced as the first club for that cohort.

The maintained MIT `read-excel-file` package is pinned at 9.3.17 for real XLSX parsing, server-only. npm audit reported zero vulnerabilities on installation. Node built-in ZIP bounds run before that parser. No paid service or spreadsheet runtime is required. `scripts/generate_member_excel_template.py` regenerates the blank template using Python's standard library as a development command only; Python is not part of the application image.

## Manual QA

1. Download and open the template in Excel, enter Vietnamese names and phones with a leading zero, then preview and confirm. Check numeric-phone repair, optional columns, duplicates, invalid rows, cancellation and `.xls` guidance.
2. Edit the file or add a matching member between preview and confirmation; the old preview must be rejected. Retry a confirmed request, revoke the host's rights, and try another account/club; no duplicate or unauthorized rows may be created.
3. Copy a past/cancelled/settled session on Free. Review zero gender fees, venue and policies. Dates and deadlines must be empty and the new session must have a distinct public URL with no inherited roster or money.
4. A new host can start or explore later without blocking normal usage. Check the aggregate cohort only as platform admin; verify no invented historical counts and no contact/file values in the report.
5. Check keyboard focus, upload/confirmation feedback, reduced motion and 375/768/1440px layouts. Native Excel rendering, Safari and physical mobile upload behavior require manual verification beyond Chromium automation.

## Validation and release

Final source identity, automated results and deployment evidence are recorded here after acceptance. Operator backups and credentials stay in ignored private artifacts; no production fixtures or test transactions are permitted.
