---
name: Targets apply from their own date
description: 2026-11-18 owner flipped the "first change covers earlier days" rule; no-targets is a normal state; copy for it must be neutral
type: project
---

Artur decided on 2026-11-18 that a targets change applies from its own date until the next one, a day before the first change has none, any change (the only one too) can be removed, and a user may skip the first run. This reverses decision 0.2 of `docs/design/targets-and-foods.md`. Design: `docs/design/targets-from-their-date.md`.

**Why:** the fallback made "which days a change rewrites" hard to say, and forcing targets put Sign out and Delete account on the first-run page. He also said users may log without targets for days on purpose.

**How to apply:** treat "no targets" as a normal state, not an unfinished setup. Any copy shown to such a user states what is available and nothing more: no "not set yet", no setup or selling language, no accent, icon or count, nothing that grows or repeats. He approved FR-TGT-03 and FR-TGT-07 wordings that day; other requirement wordings that follow from it still need his yes.
