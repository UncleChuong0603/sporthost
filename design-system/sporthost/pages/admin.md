# SportHost Super Admin

Extends the existing SportHost palette, typography and spacing. The master file's retired runtime description does not apply: implementation uses Next.js App Router, React, TypeScript and Tailwind.

- Independent `/admin` shell; 256px persistent desktop sidebar and native collapsible mobile navigation. No nested Host shell.
- Teal primary actions, dark ink sidebar, white surfaces, subtle borders and tabular numbers. Reuse existing semantic CSS tokens and Lucide icons.
- Dense, labelled tables with horizontal scrolling confined to each table, server pagination, debounced search and visible empty/error/loading states.
- Give each chart a title and an expandable accessible data table. Zero days are included; unsupported history is explicitly labelled.
- Native confirmation dialogs support Escape and focus return, show the affected ID, proposed operation and administrative reason. Write results use live status notifications; errors stay beside the form.
- Minimum 44px interactive controls, visible keyboard focus, Vietnamese interface and Asia/Ho_Chi_Minh display times. Existing application has no dark-mode switch; admin follows the same tokens.
- No animated counters, fake activity, inferred registration dates or screenshots counted as revenue.
