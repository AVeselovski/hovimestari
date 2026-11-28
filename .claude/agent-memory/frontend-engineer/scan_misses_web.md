---
name: Scan misses, web slice
description: What slice W of scan misses (fix/scan-misses, 2026-11-26) cost a round trip: programmatic blur in jsdom, autofocus hiding focus-in-press, the phone entry guard in tests, the fake camera path, copy that a design measured wrong, a double tap onto rows, and a press guard's latch
type: project
---

- **Any `blur()` the product calls on a focused field inside a Base UI sheet throws in jsdom** ("relatedTarget?.hasAttribute is not a function": jsdom blurs with the document as related target). A desktop-width jsdom autofocuses the log sheet's search field, so a blur on Look up broke every suite that presses Look up. Gate a keyboard-only blur to `useIsMobile()` (no software keyboard from `md` up), and in its test stub the phone and spy on the field's `blur`.
- **A focus-in-the-press assertion passes vacuously when the field is already focused** (desktop jsdom autofocus). Focus the pressed button first, then assert `document.activeElement` inside the `act` that clicks. Confirmed by moving the focus into a `queueMicrotask`: red only after the button was focused first.
- **With `stubPhone()` the log sheet's lists wrapper (`useArmedAtRest` guardProps) swallows presses until the sheet is at rest.** A finder behaviour is easier to pin in the ingredient picker, which has no entry guard.
- **Playwright's fake camera fails with NotFoundError when the `--use-file-for-fake-video-capture` path holds `..`.** Pass a resolved absolute path. `scratchpad/scan4b/ean13.y4m` plays the EAN-13 6408430000258.
- **A design's "measured at two lines" was wrong for this build.** The shop's own line took three lines at 320, 375 and 390 in both the old and new wording. Fit-test every line a check names in the real element before trusting a claim, and hand owner copy back rather than reword it.
- **A button that replaces itself with lists puts rows under the second tap of a double tap.** Search by name opened the row that rendered in its place, in both hosts. Fixed in the finder: what renders in the block's place takes no press for `ARM_DELAY_MS`. Check any button whose press swaps the content under it.
- **In the ingredient picker the footer's Done rides over the barcode block's Look up with an emulated text keyboard at 320 by 568.** The log sheet's search view has no footer and is spared. Left in `TODO.md`.
- **A press guard's latch cannot be cleared at pointerup.** The click comes after the pointerup, so a reset there lets through the press the guard exists to stop. The shared rule (`usePressGuard`'s `useHeldPresses`) forgets a press on pointercancel and ignores the latch for a click with `detail` 0 (Enter, Space, a screen reader), which never belongs to an earlier press. Testing-library's `fireEvent.click` has `detail` 0, so a test of a tap that started while held clicks with `{ detail: 1 }`, as a browser's tap does.
- **The fixes after review (2026-11-28) answered the lookup through a route that fetches the kept product's detail** (`GET /foods/:id` through the same relay, then `{ result: "found", food }`), so an Open Food Facts food's view opens with no call to Open Food Facts. Script: `scratchpad/scanfix/ui/source.cjs`.
- **Storage state for several Playwright contexts:** save `ctx.storageState()` before each close, or the next context lands on sign-in (refresh rotation). A new account first meets the first-run page: press Continue without targets once.

**Why:** each cost a run on this branch. **How to apply:** before testing a blur, a focus move or a double tap in the food finder, and before a fake-camera browser run.
