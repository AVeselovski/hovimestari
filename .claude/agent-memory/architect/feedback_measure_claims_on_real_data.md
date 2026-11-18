---
name: Measure design claims on real data before writing them
description: The step 2 design review found the search ranking claims false on real Fineli names; run any ranking or data rule on real rows first
type: feedback
---

Before a design claims what a rule does ("rahka finds quark first"), run the rule on the real data and quote the result. Plan tests on a committed sample of real rows that includes the awkward cases, not on one invented row per branch.

**Why:** in the step 2 design (2026-11-15) the first search rule split name parts on every comma (Fineli's decimal commas, "<0,5 %", count too), so plain quark fell behind a dozen flavoured ones and the egg ranked 88th for "muna". The planned fixture had one invented row per tier and would have passed over all of it. The review also caught a punctuation-only query matching the whole catalogue (normalisation leaves zero words). The rule was then fixed by measuring candidates with a Python replica on release 18.

**How to apply:** for any search, ranking, parsing or import rule, write a throwaway replica in the scratchpad, run it on real rows, and put the measured outcome and its known limits in the doc. Check the empty-input edge (zero words, zero rows). Literal requirement wording wins over convenience: the orchestrator ruled FR-TGT-04's "fields start empty" literally (no prefill of a later targets change), and Artur settled it on 2026-11-18 with new wording in `docs/requirements.md`: new targets start empty, and an existing change opens on its own targets.
