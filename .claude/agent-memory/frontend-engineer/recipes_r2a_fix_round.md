---
name: Recipes R2a fix round
description: What the R2a fix round (2026-11-21) cost a round trip: Next renders the page it goes back to before popstate reaches a later listener, the framework rewrites the title after mount, a figure table that cannot fit units at 320, a focus test that passes on desktop jsdom, red runs in a scratch worktree, dialog names that change with the view
type: project
---

- **Next shows the page it goes back to before `popstate` reaches a listener added later, even in the capture phase.** A "did we come back through the history" flag set on `popstate` was still false when the list mounted, for the page's own `router.back()` and for the browser's back alike. What works: the Back button says so itself before `router.back()`, plus the Navigation API's `navigate` event with `navigationType === "traverse"`, plus `popstate` for browsers without that API (`lib/recipeNav.ts`). A jsdom test that dispatches `popstate` before mounting passes either way, so only the browser shows this.
- **The framework writes the route's title again after the page has mounted**, as its metadata arrives, so a title set once in an effect is overwritten most of the time (it held in 1 run of 8). `useDocumentTitle` rewrites the title's text node in place and puts it back from a MutationObserver. Never assign `document.title`: it swaps the text node, and the framework's later titles go to a node no longer in the document.
- **A three-column figure table cannot hold "10000 kcal" and "1000000 kcal" on one line at 320.** Padding between columns does not help once a cell overflows. What fits: fixed figure columns (64 and 84 px), numbers alone in the cells, the unit once in the row's label on a phone, and the unit back in the cells from md. Measure with the extreme recipe (10000 kcal a serving, and 1000 g protein a serving, at 100 servings), not with the shakshuka.
- **An own food's macros may not add up to more than 100 g per 100 g**, so a seed for the extreme needs two foods: one at 900 kcal for the calories, one at 100 g protein for the grams.
- **A focus test in jsdom runs as a desktop**, where a search field focuses itself on mount, so "focus goes to the search field after Back" passed before the fix. Run such a test under `stubPhone()` from `@/__tests__/formSheet`.
- **Red runs for a whole batch**: `git worktree add --detach <scratch> <base>`, symlink the four `node_modules` folders, copy `packages/types/dist` and `messages/en.d.json.ts`, copy the new test files over and run them there. Remove the worktree at the end.
- **A dialog whose name changes with its view breaks `getByRole("dialog", { name })` helpers** in every suite that drives it. Find it by a marker inside it (`[data-status-line]` and `closest('[role="dialog"]')`).
- **`rm` with a shell variable in the path is refused by the harness.** Use literal absolute paths.
- **An unchanged recipe save answers as unchanged, and a read answers a removed portion as grams**, so the "portion no longer available" refusal only shows when the portion is deleted while the editor is open. A screenshot of it needs the delete sent between opening the editor and Save.

**Why:** each cost a build cycle or a wrong reading on this branch.
**How to apply:** before any "restore the place on Back" work, any per-page browser title, any figure table for a phone, and when writing focus tests for sheets.

## Last batch (2026-11-21, after the delta checks)

- **A sheet's scroll lock restores `<main>`'s scroll when it unmounts, also when its page has been left.** A link inside a sheet (Open recipe) left for a page that scrolled itself to the top, and the lock's cleanup then wrote the old page's `scrollTop` back. Trace `main.scrollTop`'s setter with a stack in the browser to see who writes. The lock now restores only on the path it was taken on.
- **A place for "back as it was" belongs on the history entry**, in `history.state` beside Next's keys: `history.replaceState({ ...history.state, key: place }, "")` passes straight through Next's patch because the state already carries `__NA`. Next keeps custom keys on a restore and drops them on `router.replace` and `router.push` of that entry. Read it in a `useState` initialiser of the page that mounts, and take it off in an effect. Listening for `popstate` or the Navigation API to learn "did we come back" was the wrong question.
- **`router.replace` scrolls after the new page's layout effects**, so a row focused and scrolled into view on mount ends at scroll 0. Pass `{ scroll: false }` and scroll in the page.
- **The router scrolls only on a push.** A traversal to a page with nothing kept shows it at the scroll the page before had, since `<main>` persists.
- **Background servers started with `run_in_background` stop after 30 minutes** unless a longer `timeout` is passed. A browser sweep then fails with a selector timeout, not a network error.
- **A delete sweep eats its own seed.** A script that deletes "the last recipe by name" three times deletes the recipe the next script opens. Seed again, or delete throwaway rows.
