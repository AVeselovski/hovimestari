# @hovimestari/types

The Zod schemas and TypeScript types that the backend and the web app both use. The backend parses request bodies with these schemas, and both apps type the API with them, so the two sides cannot disagree about a shape.

## Usage

```ts
import { LoginBodySchema, type LoginBody, type ErrorCode } from "@hovimestari/types";
```

The apps import the package's build output in `dist/`. `pnpm build` and `pnpm dev` build it first through Turborepo. After changing a schema outside those, run `pnpm --filter @hovimestari/types build`.

## Rules

- Every schema is named `<Thing>Schema`, and its type is `<Thing>`, inferred with `z.infer`. `LoginBodySchema` gives `LoginBody`.
- A request body ends in `BodySchema`.
- A schema refusal that the web app shows names an error code as its message, with Zod 4's `error` option: `z.email({ error: "invalid_email" })`. The backend answers that code. Every code is listed in `ERROR_CODES`.
- Limits both sides enforce are exported constants in upper case, such as `MAX_PASSWORD_BYTES`.
- The package is NodeNext ESM: relative imports inside `src/` end in `.js`. Every module is re-exported from `src/index.ts`.
- Every figure the app shows is computed by the functions in `figures.ts` and `recipeFigures.ts`, in integers. The server answers every figure through them, and web code that shows a figure calls the same ones, so a preview is the figure saved. Never compute a figure with floating-point arithmetic elsewhere.

## Modules

```text
assistantChanges.ts  The actions of an assistant's changes, an entry as a line of the record, a field change, a recipe field change with its line changes, the summary union, one change as a person reads it, and a page of changes with its query and page sizes
auth.ts        Sign-up, sign-in, refresh, Google exchange, password and account bodies, the user, the settings body, the session grant and the browser session
barcode.ts     The barcode lookup's body with its optional scan format, and its five answers: found, incomplete, not found, a shop's own, digits no barcode has
connections.ts A connection key's access, lifetimes, limit and prefix, the create body, a connection, a connection with its count of changes, a past connection, the list with what the server offers, and the one answer that holds the key
cooks.ts       A cook's line, add and body, saving it as a recipe, a cook, its write result, cookDiff and cookDiffers, what a batch changed from its recipe
dates.ts       IsoDateSchema, a calendar date that exists, TimeZoneSchema with isKnownTimeZone, addDays, and weekOf with WEEK_START and WEEK_LENGTH, the Monday to Sunday week
days.ts        A day, its readings and summary, the day and range queries, summarizeDay, the one day summary that sets each reading's position, DayRow, the fields it reads of an entry, and averageOfDays, a range's average day in both readings
entries.ts     Entry kinds and statuses, the limits, the add, patch, status, copy and remove bodies, and an entry
errors.ts      ERROR_CODES, ErrorCode, ApiError with the line a recipe refusal names and a refusal's details, ErrorDetails, and isErrorCode
figures.ts     Figures, positions, and the one figure computation: entryFigures, with a scale per 100 g, meal, serving or whole, totalOf, averageOf, positionOf, gramsForPortion, and the integer helpers scaled and divRound
foods.ts       Food sources, Fineli portion units, food-name languages, the food, portion, list and last amount shapes, favourites, the search query and its answer of two lists (`FoodSearchResultSchema`), the own food and portion bodies (a new own food's barcode must be well formed), BarcodeSchema, macroSumWithinLimit and hasSearchableWord
gtin.ts        A barcode's digits: checkDigitOf, hasValidCheckDigit, expandUpcE for a UPC-E, isWellFormedBarcode, whether digits can be a barcode at all, and sameBarcode, whether two barcodes are one code
log.ts         A recent item, a food, a saved meal or a recipe with its last amount, and the recents query
recipeFigures.ts  recipeBasis, one serving of a recipe from its counted lines, and scaleRecipe, its lines at another number of servings
recipeFilter.ts   filterRecipes and sortRecipes, the one way recipes are found, and fold, which lowers the case and takes off accents
recipes.ts     Ingredient units and the recipe limits, distinctLineIds, the line, recipe, edit and preview bodies, a recipe, its summary, its line, a scaled recipe, a preview, the filter as JSON and the list's query
results.ts     What each entry write and save-and-log answers: the entry or entries, the days they changed, and the outcome
savedMeals.ts  A saved meal, its bodies, the list query and the save-and-log body
targets.ts     The target ranges, the set-targets body, a dated change, the targets overview, and sameTargets, the one bound-for-bound comparison
```

## Tests

`src/__tests__/` holds the schema, date, figure, day summary and recipe tests, on Jest 29 in native ESM mode. Run them with `pnpm --filter @hovimestari/types test`.
