# SportHost member portal overrides

The existing MASTER.md colors, Vietnamese system fonts and accessibility rules remain authoritative. The implementation stack is Next.js/React/Tailwind.

The initial sports query returned a marketing hero and red palette, which do not fit this transactional portal. A narrower product search identified Membership/Community. Its landing-page and analytics suggestions are not adopted; the concrete layout below follows the existing application and mobile navigation guidelines.

- Four destinations: Home, My schedule (upcoming/history), Payments, Profile.
- A dark teal brand header, white cards on the existing muted background, readable primary text and teal actions. No photos, marketing hero or invented activity.
- Mobile fixed bottom navigation with safe-area padding, labels plus SVG icons, and at least 44px targets; desktop uses the same destinations above the content.
- Content width 1024px; two-column cards only at suitable breakpoints. Verify 375/768/1024/1440px without horizontal scrolling.
- Upcoming sessions and invitations take precedence. Money is tabular, in VND, with separate debt and refundable credit. Pending proof is never presented as paid.
- Visible pending/error/success states, keyboard focus, semantic headings, native form labels and current-page navigation.
- No automatic phone matching. Explain verified email plus explicit club-owner linkage in the empty state. Revoking that link removes authenticated access on the next request.
- Preserve unauthenticated guest-link flows. Member links use authenticated resource IDs, never a bulk export of bearer tokens.
