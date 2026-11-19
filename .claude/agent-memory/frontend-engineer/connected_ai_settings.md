---
name: Connected AI settings gotchas
description: What slice 3 of connected AI (Settings section and key reveal, 2026-11-19) and its fix round cost a round trip: storageState rotation, a no-op onClose masking dismissible, fake server via api.defaults.adapter, region queries behind a modal, long-panel screenshots, TanStack pending on refetch, scroll anchoring behind sheets, the lock's stale scrollTop, jest path regex, stale catalog types
type: gotcha
---

- **Save `storageState` at the end of every Playwright context, not only after sign-up.** The refresh cookie rotates on each new context, so the next context loaded a spent cookie and landed on sign-in after one sweep.
- **A reveal that must never close needs a test that mutates `onClose`, not only `dismissible`.** With a controlled `open` and a no-op `onClose`, `dismissible={true}` alone keeps the sheet up and the test stays green. The bug worth guarding is someone wiring a dismissal to the confirm.
- **A fake server behind the real API client:** set `api.defaults.adapter` (`src/__tests__/helpers/connectionsServer.ts`). The interceptors then run, so a 401 renew-and-retry is tested through `lib/api.ts`, and the fake remembers creates and revokes.
- **Capture the section element before opening a dialog.** `getByRole("region")` fails while the modal hides the page, even inside a `waitFor` after the dialog closed (it is still sliding out).
- **Element screenshots of a long panel under the fixed tab bar come out broken** (1890 px tall, mostly empty). Scroll the panel to the top and take a viewport screenshot instead.
- **A row's `divide-y` border follows the `li`'s rounded corners** and curves at its ends. Draw the rule with a `before:` pseudo element, as `ConnectionRows.tsx` does, or use an `<hr>` as the sign-in methods do.

- **A dataless TanStack query goes back to `pending` (error cleared) when it refetches.** A Try again keyed on `isError` swaps to the loading frame mid-retry and the button leaves the DOM under the finger. Hold the failed state locally (`retrying`) until the refetch settles.
- **Scroll anchoring is not something to rely on behind a sheet.** Chromium anchored a row that landed after a network round trip, but not one put into the cache in the same commit as a sheet hand-over (cause not found), and Safari has no anchoring at all. Keep lists behind a modal step still, and add the row when it closes (`flushSync` so focus return can target it), then `scrollIntoView` after the lock lets go.
- **The main scroll lock must restore the last scrollTop, not the one at open** (`useMainScrollLock` follows scroll events while held). Restoring the stale one is what made the page jump by a row on close.
- **`jest <path>` takes a regex: a path with `(app)` matches nothing.** Pass `settings/__tests__/x` instead in mutation scripts, or every mutation "passes" with no tests run.
- **`pnpm typecheck` regenerates `messages/en.d.json.ts`; bare `tsc` reads the stale one** and reports a new catalog key as missing.

**Why:** each cost a run or a false green on `feat/connected-ai-settings`.
**How to apply:** in any Playwright sweep with several contexts, any sheet that refuses every dismissal, and any list of rows with a focus ring.
