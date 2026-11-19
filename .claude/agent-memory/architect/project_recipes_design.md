---
name: Recipes design choices (step 5)
description: Why a recipe entry stores a per-serving basis, why cooks exist only for "as made", the copy-detach rule, images in Postgres (docs/design/recipes.md, 2026-11-19)
type: project
---

Step 5 (`docs/design/recipes.md`) stores a recipe entry's basis **per serving at the entry columns' precision** (kcal 2 dp, grams 3 dp), from `recipeBasis` (exact integer sum over lines, one rounding), and scales by servings with the per-meal arithmetic. That makes "whole recipe" and "all servings logged on a day" the same number by construction.

**Why:** a whole-batch basis needs more precision than `numeric(7,2/7,3)` and gives a whole that differs from N servings logged. Per-line figures were dropped from lists because rounded lines do not add up to the whole (43.5 vs 43.6 g in the worked example), and the day's rule is rows add up.

Other choices, all in section 0 for Artur to veto: a cook exists only when logged as made (plain entries point at the recipe); a cook edit rewrites every entry from it, past and eaten too (FR-REC-13, proposed FR-DAY-07 wording); copying a cook's entry plans the recipe again (otherwise next week's copy would change with this week's pot and drop off the grocery list); lastPutOn is computed from entry dates; Recipes tab becomes three segments; images in Postgres, shipped last, out of MCP reach.

**How to apply:** step 7 and 8 designs read `listRecipes` (perServing, basis, lastPutOn) and the line model as is. "Save cook as recipe" is a server call because the cook sheet mounts on the Day tab and log sheet, where the editor is not: check mount sites before choosing a client-side reuse.
