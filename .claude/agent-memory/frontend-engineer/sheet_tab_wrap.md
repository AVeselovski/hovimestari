---
name: Sheet Tab wrap
description: What the sheet focus-trap fix rounds taught: native date segments, measuring order not zone, the phone body-focus start, form sheets refusing Escape in probes
type: gotcha
---

- **A native date field is four Tab stops in Chromium 153 (en-US): month, day, year, then the calendar button.** Tab and Shift+Tab move between them, and every keydown fires on the same `<input>`. The page cannot see which segment has focus (closed shadow tree). So `lib/sheetTab.ts` never wraps from a date or time field; the browser takes the key and, at the sheet's end, lands it on Base UI's guard, where the next Tab is wrapped as "from outside". To name the segment in a probe, press ArrowUp and read which part of the value changed (the calendar button changes nothing).
- **`focus()` on a date field that already has focus keeps its current segment.** A probe that resets the value and calls `focus()` between rounds reads the wrong segment. Move focus off first.
- **A zone sweep ("is focus inside the sheet?") passes a wrap that skips or pins stops.** That is how the date-segment regression got through. Assert order: a paced full Tab cycle, a paced full Shift+Tab cycle, and the second must equal the first reversed (`scratchpad/fix5/order.cjs` had the shape).
- **At 390 a sheet opens with focus on its body, not its first field** (the phone rule). A probe that assumes "opens on the date field" must press one Tab first.
- **A form sheet with an edit in it refuses Escape** (and every other dismissal). A probe that edits a field and then closes with Escape stays open; reload the page instead.
- **Mutation key for `next/jest`:** SWC rewrites `@/` imports, so a `moduleNameMapper` on `^@/hooks/...` never matches; key on the path tail `(^|/)hooks/useSheetTabWrap(\.ts)?$` (from the reviewer).

**Why:** each cost a probe rerun or let a regression through review.
**How to apply:** before touching `useSheetTabWrap`/`sheetTab.ts`, or writing any keyboard probe against a sheet.
