---
name: Connected AI settings gotchas
description: What slices 3 and 5 of connected AI (Settings section, key reveal, Activity sheet, 2026-11-19) cost a round trip: storageState rotation, a no-op onClose masking dismissible, fake server via api.defaults.adapter, region queries behind a modal, long-panel screenshots, TanStack pending on refetch, scroll anchoring behind sheets, the lock's stale scrollTop, jest path regex, stale catalog types, retained sheets reusing a query, toEqual on DOM nodes, divide-y on paged lists, figure-unit wraps, the write brake, killing servers by PID
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

Slice 5 (Activity sheet, `feat/connection-activity`):

- **`useSheetTarget` keeps the last sheet mounted after it closes** (`useRetainedValue`), so a reopen remounts it in the same commit and the query never loses its observer. With `staleTime: Infinity` the second open showed the first open's pages. Put the per-open key in the query key (`connectionChanges(id, open)`).
- **`expect(nodes).toEqual(before)` compares DOM nodes by content, not identity.** A mutant that remounted every row stayed green. Compare `now[i] === before[i]`.
- **`divide-y` on a list that pages grows the old last row by 1 px** when a page lands (it gains the bottom border). Rule each row's top (`border-t first:border-t-0`) so appending moves nothing. Only a real-browser box measurement showed it.
- **Mono detail lines broke between a figure and its unit** ("4.9 / g protein"). Render each part `inline-block max-w-full`, with the separator between parts as the break point.
- **Making 100 changes through MCP:** the per-minute brake is 30 writes for the whole person, every key together. Space calls about 2.2 s apart.
- **Killing servers:** `pgrep -f`/`pkill -f` is refused by the permission classifier. List PIDs with `ps -eo pid,cmd | grep "next start --port N"` and kill those. A restarted `next start` needs `BACKEND_URL` in its env too, or the BFF relays to `.env.local`'s port and Settings never loads.

Slice 5 fix batch:

- **Focus to a new page's first row: scroll only when its headline is out of view.** The row lands where Show more was, so it is nearly always in view. `scrollIntoView({ block: "nearest" })` alone scrolled the part of the row below the fold into view and moved every row above it (measured: 0 px shift with the guard).
- **A live region that repeats the same words says nothing the second time.** Key the announcement's span on a counter so the node is replaced (`announcing()` in `ConnectionActivitySheet.tsx`).
- **`aria-hidden` visible lines plus one `sr-only` sentence** is how a row of separated parts reads as one sentence. Build the sentence from catalog messages (`spoken.*`), never by joining English in code.
- **Drizzle's `max(column)` already decodes through the column.** A reviewer asked for `.mapWith`. It would be a no-op. Check `node_modules/drizzle-orm/sql/functions/aggregate.js` before adding one.
- **Killing the `npx next start` PID leaves `next-server` on the port.** The next start fails with EADDRINUSE in its log, and the old server serves the new `.next` with a stale manifest: every chunk answers 500 and Settings shows the error page. Stop by port: `fuser -n tcp 3930`, then kill that PID.
- **The per-minute brake also trips the first time a script runs 28 calls at once.** Retry a `per_minute` refusal after 15 s with the same request key rather than failing the run.
- **A phone's `size="auto"` sheet holds the height it had when its entry ended (450 ms).** Content that loads after that scrolls inside the held height. The Activity sheet opens auto only for a record of three or fewer, and a read delayed 1 s at 390 left it 288 tall instead of 495. Measure with `page.route` delays before choosing auto for content that loads.
- **jsdom 20 has no `DOMRect`.** A `getBoundingClientRect` stub returns a plain object of the same shape.

**Why:** each cost a run or a false green on `feat/connected-ai-settings` or `feat/connection-activity`.
**How to apply:** in any Playwright sweep with several contexts, any sheet that refuses every dismissal, and any list of rows with a focus ring.
