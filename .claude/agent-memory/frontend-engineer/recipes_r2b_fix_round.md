---
name: Recipes R2b fix round
description: Decisions and gotchas from the R2b fix batch (2026-11-22): the capped Recipes list, a filter draft is not data, a figures line that drops a word whole, setQueryData's undefined, reads the real app never makes, serving caps in seeds, a brief's premise checked against the code
type: project
---

- **Decided by the orchestrator: the log sheet's Recipes list shows five, favourites first, then "All 30 recipes" in place.** Why: 30 recipes put the saved meals six screens down the app's most used path. The expansion lives in `FoodSheet` state, not in the list, because the list unmounts for a view and for results. A test that goes into a view and back proves it (mutation: `all: false`).
- **Decided: a filter sheet's draft is not data.** Every dismissal is Cancel. It is `dirty={false}` on `FormSheet`, nothing around the wrapper. Do not apply the form-sheet "typed text refuses a swipe" rule to a sheet that only holds a filter.
- **Decided: two controls named Clear reach the same.** "Clear search and filters" resets the order too.
- **A line of figures that must never cut a word: a wrapping flex row one line tall with `overflow-hidden`** (`figuresLine` in `styles.ts`). Pieces that must stay go first, and a piece that does not fit wraps out of sight whole. `truncate` cut "protein" mid-word. The gap between pieces is the flex gap, so `textContent` has no space between them: tests read pieces, not one string.
- **A brief's number can be out of reach. Measure before promising.** "Fits whole at 320 with a five-digit kcal figure" needs 237 px and the row has 228 after the star's column is given back. Say so with the numbers and deliver what holds (no cut, the word leaves).
- **A brief's premise can be wrong.** "Name it once, as the food and meal views do": those views name it twice, header and body. The header's `wide` form was already there for a view whose body does not repeat the name. Do what was decided and report the mismatch.
- **`setQueryData` with an updater that returns the same data still notifies, and TanStack already keeps the old reference for an equal answer.** A test of "no new object" passed with and without the fix. To write nothing, return `undefined` from the updater, and count `updated` events on the query cache in the test.
- **In the real app only the recent items are read again on focus or reconnect.** A browser check that waits for a recipes re-read waits for ever. Count the requests by URL before calling a "nothing moved" check proved. `visibilitychange` must be dispatched on `window`.
- **A serving is capped at 10000 kcal and 1000 g of a macro**, so a five-digit figure in a seed is exactly "10000": oil 900 g, minced chicken 1000 g and sugar tuned to 9999.8 kcal.
- **`max-md:px-3` on a form sheet's two footer buttons** (`sheetActionsButton`) put "Show recipes" and "Save estimate" on one line at 320. "Delete account" still wraps.
- **A new log-sheet test file copied from a sibling drags its unused helpers**: lint fails on them, Jest does not. Run eslint on the new file before committing.

**Why:** each cost a run or a wrong claim in this batch.
**How to apply:** before capping or folding any list in a sheet, before promising a fit at 320, and before crediting a cache test.
