---
name: Barcode lookup on the web
description: What slice 2 of barcode (feat/barcode-lookup-web, 2026-11-19) cost a round trip: jsdom blur in a sheet, live regions doubling text, mutationFn a tick late, offline means navigator.onLine, the OFF stand-in, real calls through the proxy, and the one-callback decision
type: project
---

- **Enter's blur throws in jsdom inside a Base UI sheet** ("relatedTarget?.hasAttribute is not a function"). The field is autofocused on desktop, and jsdom hands Base UI a related target that is no element. Focus something else in the sheet (the block, `tabIndex=-1`) before `keyDown` Enter, so the blur has nothing to do.
- **The block's visible line is `aria-hidden` and the live region says it** (one mechanism). Tests read the visible line by `[data-barcode-line]` and the live text by `[aria-live]`.
- **`useMutation`'s `mutationFn` runs a tick after `mutateAsync`.** A fake that records calls is empty right after a synchronous press. Press inside `await act(async () => ...)`.
- **`useKnownOffline` reads `navigator.onLine` and the auth status, not TanStack's `onlineManager`.** Fake offline with `jest.spyOn(navigator, "onLine", "get")`, and to flip it mid-test dispatch `online`/`offline` on `window` inside `act`. Never hold offline as state: derive it at render (the fix round's dead-end bug). Playwright's `context.setOffline` drives it live.
- **Decided (fix round): the typed-state line sits under Look up, not over it.** Over it, its two rows at 320 put Look up 3 px under an emulated keyboard at 320x568. Measure keyboard clearance whenever a line is added above a button in the log sheet.
- **jsdom focus after a removed button falls to body; a browser's Base UI puts it on the popup DIV.** A focus test must also focus `dialog()` by hand before the state change, or it passes on code that only rescues focus from body.
- **A `page.route` handler that sleeps then `continue()`s throws "Route is already handled" after a navigation.** Catch it.
- **A `cd` inside a backgrounded `( ... ) &` subshell does not carry to the heredoc after it.** Write run scripts with absolute paths.
- **Decided: no per-host callback for "this barcode belongs to a food".** `barcode_taken` stays a field line in the own-food form, true on both hosts. The turn to `found` after a save rides the existing `onSavedFood`, which only the log sheet passes. The Recipes tab needed no change.
- **An Open Food Facts stand-in must echo the requested code in `product.code`**, or the backend answers `not_found` by design. `live/off-stub.mjs` in the round2 scratchpad derived bodies from the milk fixture.
- **Real calls from the container need `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`** on the backend: Node's fetch ignores `HTTPS_PROXY` otherwise. A product the stand-in kept answers from the database with no call, so delete it from the scratch database first.
- **The container has no `ss`.** Stop servers with TaskStop by their background task id.
- **Pending state live:** hold `**/api/v1/foods/lookup` with `page.route` and a sleep, rather than a slow stand-in, since a kept product never calls again.

**Why:** each cost a run on this branch. **How to apply:** before testing anything in the log sheet with a live region or Enter, and before any live run against Open Food Facts.
