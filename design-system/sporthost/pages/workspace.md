# SportHost host workspace overrides

The existing MASTER.md palette, system fonts, spacing and accessibility rules apply. The current stack is Next.js/React/Tailwind. These overrides implement the host UX review approved on 2026-11-12.

- Keep the dark desktop sidebar with six labeled destinations and a visible current page.
- Below 1024px, use five labeled bottom destinations: Overview, Schedule, Members, Finance, Clubs. Account and logout remain in the header. Reserve bottom space and respect the device safe area.
- Session details belong to Schedule; proof review belongs to Finance. Preserve the explicit club filter when moving between Schedule, Members and Finance.
- Put actionable work near the top of the dashboard, grouped by the user's actual permissions in each club. Links lead to the relevant booking, session, proof queue or unpaid ledger.
- Reports of transfers never count as received money. Follow-up debt uses issued charges and explicit monthly dues; draft fees stay estimates.
- Session guidance follows invitation, attendance, fee calculation and money follow-up. Settling a session does not imply all debt is paid.
- Invitation sharing uses only the public registration URL. Provide selectable text when clipboard access is denied and treat dismissal of native sharing as cancellation.
- The session form separates basic details, pricing, Pro recurrence and participation policies. One-off sessions and advanced participation policies remain available on Free.
- Preserve edited session fields when changing clubs and when a server action returns an error. Update only untouched defaults and focus the error message. Open collapsed sections when native validation finds an invalid field.
- Club context follows session details and billing. Session billing highlights Finance.
- Keep payer credits separate from outstanding debt. Credit tasks lead to billing for an explicit decision about handling or refunding money.
- Free club connections require a verified player account and explicit owner selection of a member profile. Show pending, rejected, cancelled and approved request states with a clear next action. Never preselect or automatically match a profile.
