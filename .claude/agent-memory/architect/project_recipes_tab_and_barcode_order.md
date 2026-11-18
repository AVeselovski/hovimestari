---
name: Recipes tab holds meals and foods; barcode order
description: Owner decisions 2026-11-18 on the Recipes tab page, barcode in two parts, local HTTPS over deploy
type: project
---

On 2026-11-18, after a day of real use, Artur confirmed this order: week view and copy sheet, then a page for saved meals and own foods on the **Recipes** tab (name kept), then barcode in two parts (typed lookup, then camera), then connected AI. For the iPhone camera he chose **local HTTPS** (a runbook) over deploying.

**Why:** he found own foods scale better than meals for a protein shake by grams, wanted CRUD outside the logging flow, and wanted barcodes to make adding a product as fast as typing its name.

**How to apply:** the page reuses the log sheet's sheets and queries (no second implementation, no held-list state since the log sheet is unmounted off the Day tab). OFF products are shared catalogue rows. Typed barcodes look up on a press because of OFF's shared per-IP limit. Designs: `docs/design/foods-page.md`, `docs/design/barcode.md`.

**Update 2026-11-18, after review:** the orchestrator set kept Open Food Facts products as stored once and visible per user through `food_lookups` inside `visibleTo`, because one user's lookup must not change another's search. A per-user editable copy was rejected: three workarounds and a change to FR-FOOD-05. Owner-facing forks go in `TODO.md` too, since Artur does not read `docs/design/`.
