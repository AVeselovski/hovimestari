---
name: Day tab gotchas
description: What cost round trips building the Day tab (PR 3b), and how to avoid it next time
type: project
---

- **A visually hidden span with no positioned ancestor escapes `<main>`.** Its containing block is the document, so at 320x568 the document grew 137 px and a Playwright click scrolled the whole shell. Fixed by `relative` on `<main>` (AppShell). When the document's `scrollingElement.scrollHeight` exceeds the viewport, look for absolute descendants first.
- **Measure rows in `<main>`'s coordinates** (rect.top + main.scrollTop). Playwright scrolls a button into view before clicking, so viewport y moves even when nothing moved.
- **A write must not await unrelated refreshes.** `afterEntryWrite` resolves after the days are in the cache and returns the refresh as `settled`. Awaiting the refresh hung every save in tests whenever an open food detail's read was pending.
- **Midnight in a real browser:** preload a Date offset into the backend (`node --require fakeclock.cjs`, a Date subclass that adds `FAKE_CLOCK_OFFSET_MS`) and `page.clock.install` the browser at the same instant. The server's clock then runs in real time while the browser fast-forwards, which also exercises the fast-device path.
- **`jest.spyOn` cannot wrap an ESM-transpiled export here** ("Cannot redefine property"). Use `jest.mock` with `requireActual` and a pass-through `jest.fn(actual.fn)`.
- **A test's `Intl.DateTimeFormat` stub must pass through named-zone formats**, or `todayIn` gets a fake object and `formatToParts` throws.
- **Merging a squashed PR's master with `-X ours`** still applies its non-conflicting hunks against an old merge base: it duplicated whole functions and re-added a moved file. Check `git diff <tip> HEAD` after it, every time.

**Why:** each of these cost at least one full rebuild or run.
**How to apply:** read before the next Day tab or log sheet work (3c, 3d).

## Summary layout revision (PR 3b), 2026-11-16

- **A brief's "this fits one line" is a guess until measured.** The orchestrator expected "8888.8 kcal below the range" to fit a half column at 14 px. Measured: 178 px against 171 at 390 (198.5 for "to the upper bound"). Probe text widths first: append a `whitespace-nowrap` span with the target class into the real cell and read its width. An arbitrary class like `text-[0.8125rem]` that no source file uses does not exist in a dev build, so the probe silently measured 16 px.
- **"Carbohydrates" beside a figure does not fit the Eaten column at 320 or 375.** Hence "Carbs" on screen, "Carbohydrates" read aloud. Owner question filed in TODO.md.
- **A short frame needs the notice elsewhere.** The failure notice with its 48 px Try again no longer fit over the 46 px figure columns, so it covers the whole summary frame.
- Owner's driver for the revision: the entries must show on the first screen. The person hates friction. Check "rows above the tab bar" whenever the summary changes.

## Fix cycle 1 (PR 3b), 2026-11-16

- **`inert` lets a press fall through.** A closing toast made `inert` passed a double tap's second click to the row under it and opened its sheet. Hide a fading overlay with `aria-hidden` and swallow presses in the capture phase instead.
- **Base UI exits finish at once under Jest** (`BASE_UI_ANIMATIONS_DISABLED` in setup.ts). To test a closing toast or sheet, call `holdSheetExits()` from `src/__tests__/sheet.ts`; a hand-made `getAnimations` stub alone does nothing.
- **The midnight "flash" was the ask's `checking`, not a refetch.** Trace states in jsdom with slowed mocks (a MutationObserver over body text, 50 ms steps) before trusting a brief's cause.
- **Toast id collisions are invisible on screen**: Base UI tolerates a reused id. Pin the property (distinct ids per title via `Toast.useToastManager().toasts`), not a symptom.
- **Before numbers come cheapest from a scratch worktree build** at the old commit served on another port against the same backend (`CORS_ORIGIN` takes a comma list).
- **`getAllByRole` over 250 rows takes seconds**: count by a data attribute in a `waitFor` with a longer timeout.
- Owner-facing layout target held: at 320x568 the "Entries" heading must show above the tab bar. 16 px gaps missed it by 8 px; 12 px gaps and the hidden Day title meet it exactly.

## Fix cycle 2 (PR 3b), 2026-11-16

- **Chromium's date picker keys never reach the page.** After `showPicker()`, ArrowUp and Enter change the input with no keydown on it or on the document. So "typing" must come from the input's own keydown, never from the global `lastInputModality` flag. Shift+Tab inside a date input leaves the input (it does not move between segments): a script that then presses Enter clicks whatever button got focus, which marked a whole day eaten in one run.
- **`fireEvent.click` defaults to `detail: 0`**, which this code reads as a keyboard press. A test meant as a pointer press must pass `{ detail: 1 }`, or a mark moves focus and a later focus assertion passes for the wrong reason.
- **Freezing `Date.now` stalls `waitFor`.** Mock it with a clock that runs on from a chosen instant.
- **A zone change refetches targets only through an observer.** A `renderHook` test without `useQuery(targetsQuery())` never sees the new today.
- **The sheet guards `held` before `actions.save`**, so a sheet-level test cannot pin the hook's own `return "held"`. Call `save` and `remove` through `renderHook`.
- **Render order beats z-index for stacked toasts**: they share one absolute place, so the later node paints on top. Close before add keeps node order stable.
- **`pkill -f "next start"` leaves `next-server` holding the port.** Find the child by `PORT` in `/proc/<pid>/environ` and stop it. The dev backend keeps pool connections until its `tsx` child exits, so `drop database` fails until both are gone.
- **A measuring script that presses Save can change the seed data.** An estimate accepts 0 calories, so "0 then Save" saved it. Check screenshots for stray data before handing them on.
