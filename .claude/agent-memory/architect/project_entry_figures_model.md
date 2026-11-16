---
name: How entries keep their figures (step 3 model)
description: Entries store a basis written once at add plus an amount; integer figures shared with the preview; totals sum rounded rows; review lessons on where a snapshot gets rewritten
type: project
---

Step 3 (`docs/design/days-and-logging.md`, 2026-11-15, revised after review) stores on each entry its **basis** (the source's values per 100 g, per meal, or the whole estimate) and its **amount**. The basis is written **once, when the entry is added**, read `FOR SHARE` from the source. Amount edits, moves, status changes and undo keep it, and a copy copies it. The only rewrite: editing an own food or saved meal rewrites planned entries dated today or later. A used source is hidden (`deleted_at`) and never purged.

**Why:** the first draft re-took the basis on every amount edit or move, and the review showed a corrected past entry jumping (200 g at 100 kcal/100 g, food later edited to 120, entry corrected to 210 g gave 252 not 210), moves and their undo changing figures, copies of days with deleted meals failing, and a purge-with-last-entry rule racing. One write point for a snapshot is the rule; every extra "refresh" moment is a bug source.

**How to apply:** for any snapshot (step 5 recipe servings, cooks), write it at one moment and name the single deliberate rewrite. Orchestrator rulings from this review: a day's total is the **sum of the rounded rows** (so an assistant summing rows agrees), and carbohydrates and fat stay required on saved meals and estimates (question parked for Artur). A gauge's scale must depend on targets only, never on the figures, or ticks jump across states. Positions and distances compare in integer tenths. A cascade walk forbids SET NULL into user-reached tables, so a "soft" reference like `portion_id` is a plain uuid joined through the visibility rule.

Gotcha: the web query client sets `refetchOnWindowFocus: false` globally, so a resumed PWA after midnight shows yesterday as "Today". Focus refetch alone is not enough on a weak signal: the phone must compute today in the stored zone and hold writes while the cached answer is stale. Check any "today"-dependent screen for this.

Round 2 lesson (2026-11-15): an idempotency id kept "until success" silently swallows a second, real action of the same kind (a second shake logged as a replay of the first, whose answer was lost). Every client-held pending id needs a clear-on-evidence rule (any read showing the id) and a short expiry, and the server must say `replayed` explicitly so the UI never claims "Logged" for a write it did not make. Exact undo of a remove came from a ten-minute `removed_entries` row on the server, which also refuses a late retry of an undone add.
