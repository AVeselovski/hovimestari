---
name: Re-check a pre-built design against the primitives that landed
description: When a frontend design predates its primitives, the built constraints (tests, modal behaviour, API fields) break it in specific ways; check these before an engineer finds them
type: feedback
---

A frontend design written before its screens existed broke against the built code in ways only reading the code shows (days-and-logging revision, 2026-11-16). Check each of these when revising or writing a screen design:

- **Pinning tests on tokens.** PR 2d pins the macro hue classes to an allowlist of files. A new user of a reserved hue must widen that test on purpose.
- **Toasts versus modal drawers.** `BottomSheet` is Base UI `Drawer` with `modal="trap-focus"`; a press outside closes it. So a toast must sit under sheets (z 40) and a sheet shows its own failures inside itself.
- **API fields the screen assumes.** The reviewed preview needed an entry's basis and the "From" default needed a meal's creation time; neither is in the answer. Grep the Zod schema for every field a screen computes from.
- **"Nothing moves".** Any per-row word that disappears on a one-tap action moves the rows under the finger. Prefer saying it once in a reserved summary line.
- **"Today".** Never key a query by "today"; resolve the server's date and key by it. Device clock only triggers a re-read, once per new device date, and the server wins (a clock running ahead otherwise loops or holds writes).

**Why:** each of these would have cost an engineer a fix cycle; all were invisible in the design text and obvious in the code.

**How to apply:** before handing a UI design to engineers, grep the tests that pin tokens or users, read the overlay primitive's dismissal rules, and diff every field the design reads against `packages/types`.

**Added 2026-11-18 (design review of the Recipes tab and barcode):** four misses a reviewer caught. A confirmation pressed inside an open sheet must sit in that sheet's `stacked` slot, or Base UI does not nest it. A web call that can write must not be a cached query under `["foods"]`, because every food write refetches that prefix and flips the screen. A prefill with three decimals is refused by the own-food form's thousands-group rule unless it acts as the baseline. A `getUserMedia` that resolves after close needs a session guard. **How to apply:** before naming a mount site, a query key or a prefill, read the primitive's comment block and the parse function, not only the props.
