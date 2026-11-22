---
name: Recipes R2b (log sheet recipes, filter sheet)
description: What R2b's web half (2026-11-21) cost a round trip: every Day suite needs the recipes API mocked, a "+" test that pressed the wrong list's button, a chip at the end of a scrolling row, a wrapping row's last chip, select text at 320, Playwright scrolling a chip row, the pinned harness order of two fake servers
type: project
---

- **A new read in the log sheet's browse lists reaches every Day suite.** `prefetchLogLists` runs as the Day tab mounts, so once the sheet reads `GET /recipes`, 26 suites that render the Day tab or the log sheet needed `jest.mock("@/lib/api/recipes", ...)`. Add the mock to every file that mocks `@/lib/api/log`. `serve(server, { recipes: false })` in `fakeDays.ts` leaves the route to `recipeServer.ts`, which the Recipes tab suites put up before `serveMeals`.
- **`plus(name)` takes the first "+" with that name on the page.** One recipe has a "+" in Recent and one in Recipes. A test of the Recent row passed under a mutation of that row, because its mutated label no longer matched and the Recipes row's did. Scope a "+" to its list (`within(list("Recent"))`). Found by mutation, not by reading.
- **A control at the end of a chip row that scrolls is out of sight.** With 14 tags, Filter as the last chip sat about 1550 px along the row at 390, also while a filter was in force. From md, as the last chip of a wrapping row, it jumped as the tags were read and re-wrapped when its label grew. What holds still everywhere: the control outside the chips, at the row's end, with a least width for its longest label and tabular digits (`chipRowPinnedEnd`, `chipRowScroller`, `chipRowEnd`). Filed for Artur as a departure from the design.
- **A native select clips its closed text with no ellipsis.** At 320 the filter sheet's select has 220 px for text. Measure each option with a canvas `measureText` in the select's font against `clientWidth` less its paddings. "Calories per serving, fewest first" needed 233.
- **A placeholder is clipped mid-letter by default.** `text-ellipsis placeholder:text-ellipsis` on the input ends it in an ellipsis. Measure the placeholder the same way as a select's text: "Search foods, meals and recipes" needs 234 px and the field has 186 at 320.
- **Playwright's click scrolls a chip row sideways.** A "did any chip move" check after a click on a chip far along the row read a move of 270 px. Add the scroller's `scrollLeft` to each chip's x.
- **`useHeldList` compares arrays by identity.** A list sorted in render makes a new array each time, and in follow mode that sets state on every render. Sort inside `useMemo` on the query's data.
- **The form sheet contract does not fit a sheet with no save.** `describeFormSheetContract` holds a save open. The filter sheet applies a draft at once, so its own suite covers dismissal clean and dirty and focus back to the opener.
- **"Data there at first layout" is a `useState` initialiser.** `const [inTime] = useState(data !== undefined)` reads the first render. A layout effect with no dependencies then forgets a kept place when it is false. A layout effect that waits for the data, as R2a had it, applies the place however late.

**Why:** each cost a run, a rebuild or a wrong reading in R2b.
**How to apply:** before adding a read to the log sheet, before putting any control at the end of a chip row, and before trusting a "+" test.
