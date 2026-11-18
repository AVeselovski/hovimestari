---
name: Targets sheet prefill
description: Owner, 2026-11-18: only a change opened from the Settings list prefills (its own targets); "Change targets" opens empty whatever the date. Why the in-force line went, untouched Save, two browser-sweep traps.
type: project
---

- **Owner correction, 2026-11-18 (after PR #46 prefilled both modes): "the editing modal, which is activated by clicking on a target. Those ones should prefill the fields. The 'Change targets' one is setting new targets, and that one should not prefill."** So: `editing` set -> that change's own numbers, read once at mount from the `changes` prop (the sheet is keyed per open). No `editing` -> empty, and nothing follows the picked date, even a date with its own change (orchestrator's call: the first-run change is dated today, so following it would prefill "Change targets" on day one). Do not reintroduce a web-side in-force rule for prefill.
- **Never prefill asynchronously** (e.g. from `GET /targets?date=`): it would land after the dirty baseline and after a first keystroke.
- **The "In force on" line was removed, not hidden.** With prefilled fields it repeated them. Showing it only once a field differs needed two lines of reserved room under the date, which read as waste in the screenshot, against the owner's 2026-11-17 density rule. If he asks for the old numbers beside typed ones, that is the place to revisit.
- **Save on an untouched edit closes and sends nothing.** In new mode an untouched sheet is empty and fails validation before the dirty check.
- **Playwright sweeps: save `storageState` after every context.** Each reload rotates the refresh cookie, so a later context loading an older state file lands on sign-in and every phase after it times out.
- **The rm safety check refuses `rm -rf <dir>/*` after a `cd`.** Clear screenshots with `find <abs dir> -maxdepth 1 -name "*.png" -delete`.
