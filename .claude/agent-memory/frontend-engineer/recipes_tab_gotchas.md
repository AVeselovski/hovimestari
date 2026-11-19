---
name: Recipes tab gotchas
description: What the Recipes tab (feat/recipes-tab-page, 2026-11-19) cost a round trip: entry-animation measurements, slow role queries over a page, chips vanishing on archive, a mutation masked by role-hidden sheets, defence-in-depth guards, NODE_ENV and next build, device-scale shots, the fallback error line, the self-close rule
type: project
---

- **Measure a sheet only after its entry has finished.** Playwright fills fields faster than the sheet slides in. Measured mid-entry, the popup still carries a `translateY` of up to 500 px, so its footer reads as below the viewport. Wait about 800 ms after the dialog appears, or check `getComputedStyle(popup).transform` is the identity, before you call a footer "off screen".
- **A sheet whose props come from a live list can change under the finger.** `sources` came from the active meals. Archiving the last meal from a source inside the open sheet took its chip, then the whole chip row, and moved the form 58 px. The sheet now keeps every source an open has offered. Any prop derived from a list that the sheet's own action edits needs the same thought.
- **Role queries over a full page plus a sheet plus a confirmation are slow in jsdom.** A page suite needed `jest.setTimeout(15_000)`. Read rows from the DOM (`[data-list] li`) instead of `getByRole("region")` inside a `waitFor`, which also works while a modal hides the page.
- **`queryByRole("dialog", { name })` returns null for a sheet that is still open but aria-hidden.** A "the sheet closed" assertion stayed green with the self-close removed. Check `[role=dialog][data-open]` with its title in the DOM instead. Found by mutation.
- **`held` is guarded twice on the page** (the sheet's button and `useMealActions`). Removing either alone leaves the test green. Mutate both together to prove the test, and say so in the report.
- **The first-run page shows for a new account before `/recipes`.** In a script, wait for "Continue without targets" with `waitFor({ timeout })`. `isVisible({ timeout })` ignores its timeout and answers at once.
- **Seed through the API with the bearer the app sends.** Capture `authorization` from `page.on("request")` for `/api/v1` and call with `page.request.fetch`. The backend's auth routes need the web server's relay, so a script cannot sign in on its own.

- **`NODE_ENV=development` in the shell breaks `next build`.** Prerendering `/_global-error` fails with "Cannot read properties of null (reading 'useContext')". Export it for the backend only, and unset it before building the web app.
- **Playwright's `scale: "css"` ignores `deviceScaleFactor`.** For 2x phone shots use `scale: "device"` with `deviceScaleFactor: 2`: 390 x 844 lands at 780 x 1688, under the 2000 px limit.
- **A 500 `internal` refusal reads as `errors.fallback`.** `internal` is no `ErrorCode`, so `getErrorCode` answers undefined. Assert "Something went wrong. Try again." from the catalog, not an `errors.internal` key, which does not exist.
- **Every form sheet with Delete closes itself, then calls `onDeleted`** (decided in the fix round, the rule needing the least code). A host never passes its sheet's `close` as `onDeleted`.

**Why:** each cost a run or a wrong conclusion on this branch.
**How to apply:** before measuring any sheet live, before passing a list-derived prop to a sheet that edits that list, and when writing a page-level suite.
