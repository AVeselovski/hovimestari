---
name: Week average and unlogged days
description: Why only past empty readings lose their position, why the average counts different days per reading, and why its gauge is marks not a fill (docs/design/week-average-and-unlogged-days.md, 2026-11-20)
type: project
---

Artur said yes (2026-11-20) to his own Claude Desktop's two suggestions: a weekly average and "an empty day should not be positioned". Design: `docs/design/week-average-and-unlogged-days.md`.

- A position on an empty reading is a **gap** on today and later days (FR-GAP-07, planning from zero) and a **false record** on a past day. So only past empty readings lose it, per reading (an unmarked-only past day has no eaten position).
- Eaten average counts past days with eaten entries (today excluded, it moves with the clock). Planned counts every day with any entry. Different day sets, so Planned avg can be below Eaten avg: a fill gauge cannot draw it, hence ring-and-dot marks.
- An average is positioned only when all counted days share targets. Mean of bounds rejected as a computed target (FR-TGT-04); it is the likely answer when weekday targets arrive.
- `averageOfDays` lives in `packages/types` because `putDaysInRanges` patches days into cached weeks and must recompute the identical average.

**Why:** these were the non-obvious traps in the assistant's literal wording; each would have reproduced the "below by 1,900" bug at another scale.

**How to apply:** any later figure over several days (gap fill, grocery range, weekday targets) reuses the counted-days rule and `averageOfDays`, never zero-fills empty days. Float averages of tenths round wrong ((2.3+2.4)/2 = 2.3499…): use integer tenths.
