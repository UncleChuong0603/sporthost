# SportHost design system

Audience: Vietnamese badminton club hosts managing schedules, players and money, often on a phone.
Stack: FastAPI, Jinja2, semantic HTML, plain CSS and progressive JavaScript.

UI UX Pro Max was installed from nextlevelbuilder/ui-ux-pro-max-skill. Its generated
results for sports and SaaS suggested marketing heroes, so those layouts were rejected.
This dashboard uses the skill's reviewed accessibility, navigation, progressive-form,
responsive-layout and interaction guidelines with the following project decisions.

- Desktop: 248px dark sidebar, light workspace, sticky top bar, 1280px content width.
- Mobile: accessible navigation drawer, one main scrolling region, wrapped actions.
- Navigation: Overview, Schedule, Members, Finance, Clubs, Account. Club-specific
  pages add settings, payment setup, co-host access, audit history and subscription.
- Primary teal #087f6b; sidebar #142d35; text #182d35; muted #536570;
  background #f3f6f8; white cards; border #dce4e8. Status includes text, not just color.
- System sans-serif with full Vietnamese coverage. Tabular numbers for prices/stats.
- Spacing scale 4/8/12/16/24/32. Cards 16px radius. Body text 16px on mobile.
- One main action per screen. Creation and advanced settings use disclosure; tables
  have labelled filters, compact contextual actions and meaningful empty states.
- SVG icons with consistent strokes; no structural emoji. Visible focus, skip link,
  Escape-to-close drawer, sensible focus return and reduced-motion support.
- Verify at 375, 768, 1024 and 1440px with keyboard and a mobile browser viewport.
- No fake metrics, unimplemented links or placeholder buttons. Public registration
  remains separate from the host sidebar and preserves phone-first confirmation.
