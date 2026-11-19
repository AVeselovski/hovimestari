---
name: Week sheet and copy sheet (PR 3d)
description: Why the week is a sheet opened by a text Week button beside Log food and copy a checklist sheet; the constraints and review lessons that decided it
type: project
---

`docs/design/week-and-copy.md` (2026-11-18, review round 1 applied): the week is a sheet opened by a text "Week" button on the launcher's row (not `/?view=week`, not in the date bar), with week stepping in the sheet's footer. Copying is one checklist sheet opened by Copy in the Entries row. Undo needs `POST /entries/remove`. The orchestrator renamed the second reading "Planned" (was "With plan") on every surface.

**Why:** a week view made the Day header change meaning. In the date bar the button truncated "Wed 30 Dec 2026" and sat next to the most-pressed chevron. A copy button in the entry sheet hit two constraints: a dirty form sheet refuses to close, and toasts sit under every sheet.

**How to apply:** measure text widths with the app's own woff2 fonts (pip fonttools + brotli in the scratchpad, instancer at the rendered weight) instead of guessing per-glyph widths; the review caught a 284-in-280 budget and a sheet body of 280 not 288 (`--sheet-pad-x` 1.25rem). Client-held ids for a sheet that stays open must be sheet-owned: `pendingIds` expires after 60 s and `forgetSeen` drops ids on any day read. Any patch into the query cache must cancel that key first, since a cancel restores pre-fetch state.
