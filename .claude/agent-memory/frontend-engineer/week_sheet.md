---
name: Week sheet (PR 3d slice A)
description: What the week sheet's build and fixes taught: TanStack keeps manual edits through a cancel, unobserved-range tests, autoFocus on remount, footer label widths, tbody click, theme forcing, fixed column widths, tokens equal to their surface, the plan tint window, held lines
type: project
---

- **TanStack Query 5.107 keeps a manual `setQueryData` through a cancel.** A manual success updates `#revertState` (query.ts), so cancelling a read after an edit reverts to the edit, not to the pre-read state. Removing the cancel-first in `putDaysInRanges` left its pending-read test green. The older note in testing_gotchas.md ("a cancel reverts... setQueryData before it is lost") does not hold for edits made while a read is out. Cancel-first is kept as cheap insurance; say so instead of claiming a mutation proof.
- **`autoFocus` fires on every mount, not only on open.** The shown day's row had `autoFocus={shown}`, and stepping back into its week remounted that row and pulled focus off the footer button (then to `<body>` on the next step). Found by a test, fixed with a `focusShown` state that the first step clears.
- **"Previous week" does not fit half a footer at 320** (108 px text + icon + px-5 = 176 against 136). Visible "Previous" and "Next", accessible names "Previous week" and "Next week". Measure footer labels with the app's fonts before trusting a design's "each half the row".
- **A whole-row press target in a table: `onClick` on the day's `<tbody>` with `cursor-pointer`**, the date's `<button>` inside for keyboard and screen readers. No positioning against a table row, so no WebKit `position: relative` risk. WebKit itself is still unverified (none installed here).
- **A storageState saved from a light run carries `hovi-theme=light`,** so an init script that sets the theme "only when absent" never switches to dark in the next run. Set it unconditionally in a sweep that does not click the theme control.
- **Measure a sheet's "loading" state at rest:** with the range read delayed, measure after about 800 ms, not 80. At 80 ms the sheet is mid-slide and every y reads as a move.
- **An observed-range test cannot catch an old read landing over a cache patch.** `invalidateQueries` refetches an observed query with `cancelRefetch`, which hides the old answer. Test with an unobserved `prefetchQuery` still out, and assert the pending read's `AbortSignal` directly.
- **An auto-width column moves its neighbours between states.** "Today" widened the day column from `md` and shifted every figure column 11 px between weeks. Give any column whose content varies by week or state a fixed width, and measure heads' x across weeks, not only rows' y.
- **A token that equals the surface it sits on draws nothing.** `--color-gauge-track` was the panel colour, so on the sheet's `bg-surface` the track and the loading frame vanished. Check each decoration token against every surface the component is mounted on.
- **The plan tint is boxed in by the 3 to 1 fill test** (`themeColors.test.ts`): in dark, a tint can step at most about 1.5 to 1 from the band before the fill drops under 3 to 1. Search blends of band and fill in that window.
- **A "hidden when empty" line under a held-height sheet must keep its element.** Render it invisible and `aria-hidden` with a min height whenever it can ever show, or a sheet opened without it clips it under the footer after a step.
- **A selection guard on a bubbled click also swallows keyboard activation of a child button.** Check `event.detail > 0` (a pointer press) and scope the selection to the target. **jsdom's `Selection.containsNode` gives wrong answers** (true for a node outside the range, false for one inside it), so a test against it encodes jsdom's bug. Use `Range.intersectsNode` over the selection's ranges, which is correct in both jsdom and Chromium.
- **State a computed offset in classes.** A notice placed under a table head needs the head's height stated in classes (`h-*` on its cells), and the test derives the offset from those classes, so a change to the head turns it red.

**Why:** each cost a rerun or a wrong conclusion in this slice.
**How to apply:** before cache-patching code, focus-on-open in a list that remounts, or a sheet sweep across themes.
