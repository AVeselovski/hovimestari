---
name: Targets sheet prefill
description: Owner's phone test (2026-11-18): the targets sheet opens with the targets it changes; why the in-force line went, why Save on an untouched sheet sends nothing, and two browser-sweep traps.
type: project
---

- **Owner direction, 2026-11-18: the targets sheet's fields start with the targets being changed.** He read "This changes the targets for every day" as "every day ever" and wanted to edit, not re-enter. FR-TGT-04's "The fields start empty" now differs from the build; the new wording waits for him in TODO.md. The first run stays empty, and a test seeds the query cache to prove no prefill reaches it.
- **The fields fill from the `changes` prop through `inForceOn`, not from `GET /targets?date=`.** An async prefill would land after the dirty baseline and after a first keystroke. The list Settings passes in is the server's own answer.
- **The "In force on" line was removed, not hidden.** With prefilled fields it repeated them. Showing it only once a field differs needed two lines of reserved room under the date, which read as waste in the screenshot, against the owner's 2026-11-17 density rule. If he asks for the old numbers beside typed ones, that is the place to revisit.
- **Save on an untouched sheet closes and sends nothing.** On "Change targets" (no change on today) a send would add a change with the numbers already in force, a new row in the list that changes no day.
- **Playwright sweeps: save `storageState` after every context.** Each reload rotates the refresh cookie, so a later context loading an older state file lands on sign-in and every phase after it times out.
- **The rm safety check refuses `rm -rf <dir>/*` after a `cd`.** Clear screenshots with `find <abs dir> -maxdepth 1 -name "*.png" -delete`.
