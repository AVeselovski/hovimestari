---
name: Camera scan
description: What slice 4b of barcode (feat/barcode-scan, 2026-11-19) cost a round trip: Playwright's fake camera and its limits, service worker vs page.route, flushSync for reads from a promise, held exits for focus tests, the footer at 320
type: project
---

- **A read from the decode loop is not a press.** React renders it on a later task, so a lookup answer that lands first meets the old render (scanner open, old text) and `onFound` refuses to open the food. `useScanner` commits the text and the close in `flushSync`, then calls `lookUp`. Any write that starts from a promise and whose answer checks render state needs the same order.
- **Test the host's focus placement with `holdSheetExits()`.** Without it jsdom unmounts the closed scanner at once, focus falls to body, and `BarcodeResult`'s own lost-focus rule focuses the block, so a test of the host's focus passes with the host's focus removed. Found by mutation.
- **A guard that `act` makes redundant is untested.** The in-event `stop()` on `visibilitychange` passed mutation until the event fired outside `act` (silence the act warning for that one call).
- **Playwright's fake camera:** `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, plus `--use-file-for-fake-video-capture=<y4m>` for a barcode. Without a file it plays a green test pattern with no barcode, which is what to use for the scanning-state shots and the ways-out checks (with the barcode feed the read wins within one decode). Draw the barcode with `zxing-wasm/writer` in Node (`symbol` or `image`), scale ×6 nearest and pad to 1280x720 in ffmpeg.
- **Headless Chromium cannot refuse the camera.** Without the fake-UI flag, and even with CDP `Browser.setPermission` denied, `getUserMedia` answers `NotSupportedError`. Emulate NotAllowedError and NotReadableError with an init script and say so.
- **Playwright keeps every page visible,** headed or headless, tabs or minimised (no window manager under xvfb). Emulate a hide with `visibilityState` plus the event, against the real tracks.
- **`page.route` does not see service worker fetches.** The worker fetches `/_next/static/` itself. Use `serviceWorkers: "block"` on the context to hold or fail the wasm.
- **A swipe in Chromium needs CDP touch,** `Input.dispatchTouchEvent` on a `hasTouch` context, from the sheet header, after the sheet is at rest, about 700 px in 30 px steps. Mouse drags and short drags did nothing, and the next role query then failed because the sheet stayed open.
- **`lsof` does not see the old `next-server`; `fuser -n tcp <port>` does.** Kill that PID before restarting `next start` on the same port.
- **Decided in the fix batch: nothing in the scanner changes size between states.** The held sheet height did not help a failure that arrives before the sheet settles (a remembered denial opened a taller sheet), and busy's extra footer row scrolled the picture under the title. Now **Try again** sits in the picture's place and **Torch** over the picture, the footer holds Type the number alone, and the line shares one grid cell with an invisible stack of every line, so the cell is the longest line's height at any width. No room is reserved for a state alone (lesson 17 stays honoured) because every line fits two lines at 320. Measured identical at four sizes, both themes, reached from starting and opened straight into each failure.
- **A mark over live video cannot take a theme token.** Theme ink measured 1.27:1 on a white label in dark mode. The `on-camera` pair (paper and ink, same in both themes) drawn side by side guarantees at least sqrt(13.3) = 3.6:1 on any grey. The accent flips with the theme too, so Torch's on state is the ink inverse, not the accent (Artur may decide otherwise, `TODO.md`). Focus ring for a button over video: `-outline-offset-6` draws it on the button's own fill.
- **Chromium's fake camera crops to the constraint's aspect.** A 720x1280 `.y4m` arrives as 720x720 with `ideal` 1280x720. Rewrite the constraints in an init script to `exact` 720x1280 to get a true portrait frame.
- **jsdom has no `DOMRect`.** Return a plain rect object from a stubbed `getBoundingClientRect`.
- **`pressOutsideSheet` under `holdSheetExits()` from the start is refused,** because the entry never finishes and the entry guard holds. Hold exits only once the sheet is at rest.
- **`openSheet(title)` matches an `<h2>`,** so it never finds the log sheet (named by `aria-label`). An `?? dialog()` fallback after it made an assertion vacuous.

**Why:** each cost a run on this branch. **How to apply:** before testing anything camera-driven, positioned from a promise, or focus after a stacked sheet closes.

## An ordering invariant against a real library (2026-11-19)

The decoder's purge had to run before the stored load is released. A race test (poll `loadDecoder` every microtask to start a load in the gap) passed on the old order too: both sides `await import()` with the same latency, so the old purge still beat the new load's prepare. A timing race cannot be forced without stubbing the import. What works and stays honest: `require()` the library's raw CJS exports before decoder.ts first imports them, `jest.spyOn` the real `purgeZXingModule` with an implementation that records state and then calls the original. Assert the order itself (the load is still held when the purge runs). Red on the old order, green on the new (`decoderOrder.test.ts`). The spy must be set before the first interop copy, or the copy misses it.

Also: anything drawn over the live picture, the starting ring included, uses the on-camera pair. `busyRing` is theme ink and vanishes over a bright frame in dark mode.
