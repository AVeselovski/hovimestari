---
name: Recipes on days (R1b web)
description: Gotchas from the R1b web part: seeding recipe entries over MCP, row vs sheet figure formats, nbsp in test sources, a refusal no PATCH sends
type: project
---

- **Seeding recipe entries as an assistant would:** a Node script imports the MCP client by path, `apps/backend/node_modules/@modelcontextprotocol/client/dist/index.mjs` (the package's `import` export is `.mjs`, a `.js` path fails with ERR_MODULE_NOT_FOUND). Register with the BFF secret, `POST /connections` with `access: "read_write"`, then `create_recipe` and `log_recipe`, each with a fresh `requestKey`. A deleted recipe with an entry: log it, then `DELETE /recipes/:id` (it is hidden, not deleted). The script of that run was `scratchpad/r1bweb/seed.mjs`.
- **Set the seeded account's zone to UTC** when the browser context runs in UTC, or the app writes the device zone back and "today" shifts.
- **A row and the sheet format grams differently:** the row's `formatGrams` drops a trailing zero ("29 g"), the sheet's `MacroFigures` keeps one decimal ("29.0 g"). Both are right; expect each in its own place.
- **The Write tool turns a ` ` escape in a test source into a literal no-break space.** `toHaveTextContent` then normalises the received side and not the expected one, so compare `el.textContent` with `toContain` for figures with a unit.
- **`recipe_serving_too_large` never answers a PATCH of servings** (the basis is fixed at add; only adds and food or recipe edits meet the cap). The sheet shows it, if ever, as the form's footer line through `failureLine`. Decided not to map it to the Servings field, because it is about the recipe, not the typed count.
- **CountField is the one field for meals and servings** (`of="meals" | "servings"`). R2b's log block should pass `of="servings"` for a recipe rather than build another field.

**Why:** each cost a run or a red test in R1b.
**How to apply:** read before R2a, R2b or R4a web work on recipe entries.
