# Days

A day is everything a user logged or planned on one calendar date. Each entry is a food by weight, a [saved meal](saved-meals.md#a-saved-meal) by count, a [recipe](recipes.md#a-recipe-on-a-day) by servings or an estimate, and each is planned or eaten. A day adds itself up twice, as what was eaten and as everything on the day, eaten or still planned, and gives the position of each total against the user's own [targets](targets.md#setting-your-targets) with a distance. A past day's total with nothing recorded in it has no position. A week or any range of days also gives its average day in both readings.

## In detail

### A day and its entries

A day holds the entries on one date, in the order they were added. An entry can sit on any date, past, today or future. "Today" is the date in the user's [time zone](targets.md#today-and-the-time-zone). Entries reach a day and change there through [quick logging](quick-logging.md#adding-and-changing-an-entry).

There are four kinds of entry. A food entry is a weight in grams of a food from the [food catalogue](foods.md#the-food-catalogue), typed in grams or as a count of one of the food's [portions](foods.md#portions), such as 2.5 medium pieces of 55 g, which is 137.5 g. A saved meal entry is a count of meals, such as 1 or 2.5. A recipe entry is a number of servings of a recipe, such as 1 or 1.5. An estimate is a name and four typed figures. A food entry weighs at most 5000 g with one decimal. A count of meals or servings is above zero and at most 100, with two decimals.

### Planned and eaten

Every entry is planned or eaten. An entry on a future date can only be planned. An entry stays planned until the user marks it eaten or removes it.

On a past day, planned entries were never marked eaten, and the day says how many there are.

### The two totals

Each day has two readings, each with energy, protein, carbohydrates and fat. Eaten adds up the eaten entries. Planned adds up everything on the day, eaten or still planned. With nothing planned the two are equal. The API names the second reading `withPlan`.

An entry's figures are rounded once: kcal to a whole number, grams to one decimal, halves away from zero. Each reading's total is the sum of its rows as rounded, so the rows always add up to the total. A total can differ from the exact sum by at most half a unit per entry.

### Where a day stands

Each reading gives the position of its energy against the calorie range and of its protein against the protein range:

- below: under the lower bound, with the distance to it. For protein, the lower bound is the floor.
- within: from the lower to the upper bound, both included, with the distance to the upper bound.
- above: past the upper bound, with the distance past it.

A distance has at most one decimal. Eaten protein of 129.9 g against a floor of 130 g is below, 0.1 g from it. Eaten protein of exactly 130 g is within. A day without targets gets the figures and no position. A day has no targets before the user's first change, and none at all for a user with no change. The targets a day uses are [the ones in force on its date](targets.md#which-targets-a-day-uses).

A past day's reading with no entries has no position, and the day keeps its targets. The reading records nothing, so its zero is not an amount eaten. An empty past day has no position in either reading. A past day with only planned entries has none for what was eaten, and keeps its position with the plan. Today and later days keep their positions while empty, because there the distance is what is left to reach the range. At the user's midnight, an empty today becomes a past day and loses its positions.

### Figures that stay

An entry keeps the values it was added with: the food's values per 100 g, the meal's figures per meal, or the recipe's figures for one serving. Editing the amount, moving, marking, copying, removing and restoring all keep them. Correcting last Monday's 200 g to 210 g gives 210 g at last Monday's values, whatever the food says today.

Editing an [own food](foods.md#your-own-foods), a saved meal or a recipe also updates its planned entries dated today or later. Editing an own food updates the planned entries of every recipe the person still has with a line on it too. Eaten entries and every past day keep their figures.

An entry from a batch [logged as made](recipes.md#logging-as-made) is the day's own record of what was made. It carries the batch's figures, and no edit of a food or of the recipe changes it. Attaching an entry to a batch gives that entry the batch's figures, on any day, past ones included, and changes no other entry.

Deleting an own food, a saved meal or a recipe that entries use hides it instead. It disappears from search, lists and favourites, and every entry keeps its name and figures. One that no entry uses is deleted. A retired Fineli food stays loggable, and its entries keep working.

### The week

A week runs Monday to Sunday. The week of a date is the one holding it, so it stays the same while the day inside it changes. A week or any range of up to 42 days reads every day's two readings and positions without the entries. Each day's figures equal the day's own.

The week sheet on [the Day tab](../app/day.md#the-week) shows a week's days side by side: each day's two readings for calories and protein and, on a day with targets, where each stands. It states positions only, as the day does.

### The week's average

A week or any range of up to 42 days also gives its average day, in both readings. Each average counts its own days:

- Eaten counts the past days with at least one eaten entry. Today counts only once it is over, because until then its eaten figures still grow.
- Planned counts every day with at least one entry, eaten or planned, whatever its date.

A day with no entries counts toward neither, so an unlogged Monday leaves both averages as they are. A day counts whole however little is on it, so a past day with only breakfast logged counts in Eaten as a full day. The two count different days, so the Planned average can be below the Eaten one. In the week of 16 to 22 November, with today Friday 20, an empty Monday, three logged days, a part-eaten Friday and a planned Saturday give an Eaten average over Tuesday to Thursday and a Planned average over Tuesday to Saturday.

The average is the counted days' totals summed and divided by their number. kcal is rounded to a whole number and grams to one decimal, halves away from zero, once. 2.3 g and 2.4 g average to 2.4 g.

An average has a position only when every day it counts has the same targets, and it then names them. A counted day without targets, or two counted days with different targets, leave the average with figures and no position. The position is the rounded average against the shared ranges, as a day's is its rounded total. An average says whether a day it counts includes an estimate. With no day to count, an average has no figures.

### Estimates

An estimate is for a meal nobody can weigh, such as a restaurant dinner. It has a name of at most 120 characters, the four figures, and an optional note of at most 500. Energy runs from 0 to 10000 kcal and each macro from 0 to 1000 g, with one decimal. An estimate is never a recent item. Every estimate says it is one, and each reading says whether it includes one.

## How it works

### How figures are computed

`entryFigures(basis, scale)` in `packages/types/src/figures.ts` is the one computation. The server answers every figure through it, and it lives in the shared package so the web can compute the same figure. The basis is per 100 g for a food, per meal for a saved meal, per serving for a recipe, and the whole entry for an estimate. It works in integers: the basis in thousandths, grams in tenths and counts in hundredths, with one rounding per row. Floating point gets real cases wrong: 4.02 g per 100 g at 250 g is exactly 10.05 g, which rounds to 10.1, while `4.02 * 250 / 100` is 10.049999999999999. `totalOf` sums rounded rows in integer tenths, so three rows of exactly 0.35 g show 0.4 g each and total 1.2 g. `positionOf` compares and subtracts in integer tenths, and `gramsForPortion` multiplies a count by a portion's grams the same way, rounding to one decimal.

### The basis and its rewrite

An entry stores its basis and its amount. `addEntry` in `apps/backend/src/services/writes/entries.ts` takes the basis from the source with the source row locked `FOR SHARE`: a food or a meal through `sourceValues.ts`, a recipe through `readRecipeForEntry` in `recipeValues.ts`, which also holds the person's own foods on its lines `FOR SHARE`, and servings from a batch through `readCookForEntry`, which copies the cook's stored basis. `updateOwnFood`, `updateSavedMeal` and `updateRecipe` update the source first, then call `rewritePlannedBasis` in `sourceValues.ts` in the same transaction. It works in three steps:

1. It locks every planned entry dated today or later that the edit reaches, in one statement in id order. A food reaches its own entries and the entries of every recipe with a line on it that the person has not deleted. A meal or a recipe reaches its own. An entry from a batch is never reached.
2. It reads the food's or meal's values, or each recipe's serving, in a new statement, so it sees every edit that committed while it waited.
3. It writes each source's basis to the entries it locked.

The entry batches lock in the same id order, so none of them deadlock. An edit waits for an add that holds the source, and the rewrite then sees that add's entry. An add that comes second waits for the edit and reads the new values. Two edits that reach one recipe's entries, such as edits of two own foods on it, end with both changes, in either order. `updateOwnFood` reads the food's values before the edit with its row locked, so the rewrite can compare each recipe's serving before and after. An own food's edit that [the cap on one serving](recipes.md#a-recipes-figures) refuses answers `food_edit_recipe_too_large` and changes nothing.

`deleteOwnFood`, `deleteSavedMeal` and `deleteRecipe` lock the row `FOR UPDATE`, then check for entries in a new statement through `isUsed` in `sourceValues.ts`, so an add that committed while the lock waited counts as a use. An entry removed in the last ten minutes counts too, so it can still be restored. For a food, a line of one of the user's [recipes](recipes.md#ingredient-lines) or batches counts as a use as well. For a recipe, a batch does not count: every entry from a batch is an entry of its recipe too. A used source gets `deleted_at`, a used food also loses its barcode and its favourites, and `visibleTo` in `foodScope.ts` leaves it out of every food read. A hidden source is never purged.

Entry reads go through `selectEntries` in `apps/backend/src/services/entryRows.ts`. It joins the food, the saved meal, the recipe and the batch without the visibility rule, because an entry is scoped by its own `user_id`. `entriesOf` there adds whether each batch differs from its recipe, with one query for all of a read's batches and none when no entry comes from one. It joins a portion only when the portion has the entry's `portion_id`, belongs to the entry's food and is visible to the user, and answers the portion's id as null otherwise. Figures never pass through the portion.

### Reads

`getDay` and `getDayRange` in `apps/backend/src/services/reads/days.ts` build every day with `summarizeDay` in `packages/types/src/days.ts`, the one day summary. It takes the date, the user's today, the day's entries and the targets in force, and answers the relation, the two readings, their positions and the counts. The range reads every target change once and asks `inForceOn` in `reads/targets.ts`, the rule of `targetsOn` without the database, per date. Both answer null on a date before the first change. A test pins the two to each other. `getDayRange` adds the range's average from `averageOfDays` in `packages/types/src/days.ts`, which averages with `averageOf` in `figures.ts`, in integer tenths. `getEntry` there reads one entry by its id, as the entry writes answer it. A connected assistant reads days through these same services, as [what an assistant reads](connected-ai.md#what-an-assistant-reads) describes. On the web, `weekOf` in `apps/web/src/lib/week.ts` gives the week holding a date, and `WEEK_START` there names Monday.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`. The entry writes are in [quick logging](quick-logging.md#api).

| Method | Path              | Answers                                                                                                                                         |
| ------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/days/:date`     | 200 with the day. `:date` is a date or `today`. 400 `invalid_date`                                                                              |
| GET    | `/days?from=&to=` | 200 `{ days, average }`, every day without its entries and their average day. `from` on or before `to`, at most 42 days, else `invalid_request` |

A day has `date`, `today`, `relation` (`past`, `today` or `future`), `targets`, the readings `eaten` and `withPlan`, `entryCount`, `plannedCount`, `unmarkedCount` and `entries`. A reading has `figures`, `energy`, `protein` and `includesEstimate`. `energy` and `protein` are each `{ position, distance }`, or null. They are null on a day without targets, where `targets` is null too. They are also null on a past day when the reading holds no entries, where `targets` is still given. `average` has `eaten` and `withPlan`. Each has `dates`, the days it counts in date order, `figures`, null when it counts none, `targets`, `energy` and `protein`, null unless every counted day has the same targets, and `includesEstimate`. An entry has its `name`, a `food` with `retired` and `deleted` flags, a `savedMeal` or a `recipe` with `archived` and `deleted` flags, its amount, `basis`, `figures` and `isEstimate`. The amount is `grams` and `portion` for a food, `count` for a saved meal and `servings` for a recipe. A recipe entry from a batch has `cook`, `{ id, date, servings, differs }`, and every other entry has it null. A recipe entry's `name` is the recipe's name as it is now. The `basis` is what the entry's figures are computed from, as the entry stores it: per 100 g for a food, per meal for a saved meal, per serving for a recipe, and the whole entry for an estimate. When it changes is in [the basis and its rewrite](#the-basis-and-its-rewrite). The shapes are in `packages/types/src/days.ts` and `entries.ts`.

### Data

- `entries`: `user_id`, `date`, `position` from a sequence, never changed, `status` (`planned` or `eaten`), `eaten_at` set exactly while eaten, and `kind` (`food`, `saved_meal`, `recipe` or `estimate`). A food entry has `food_id` and `grams`, and when typed as a portion count `portion_id`, `portion_count` and the portion's `portion_unit` or `portion_name`. A saved meal entry has `saved_meal_id` and `meal_count`. A recipe entry has `recipe_id` and `servings`, and `cook_id` when it comes from a batch. An estimate has `name` and `note`. The basis is `basis_energy_kcal`, `basis_protein_g`, `basis_carbs_g` and `basis_fat_g`. CHECKs say which columns each kind holds, keep amounts above zero and servings at most 100. `portion_id` has no foreign key: it is a hint the read joins through the rule above.
- `entries_saved_meal_user_fk` points `(saved_meal_id, user_id)` at the meal's `(id, user_id)`, and `entries_recipe_user_fk` points `(recipe_id, user_id)` at the recipe's, so an entry's meal or recipe is always its user's own. `entries_cook_fk` points `(cook_id, recipe_id, user_id)` at the cook's, so a batch's entries are always of its recipe and user. `food_id` cascades from `foods`. `entries_recipe_idx` on `(recipe_id, date)` finds a recipe's entries, and `entries_cook_idx` a batch's.

Every table cascades from `users`, so deleting an account removes its entries and keeps every shared food.

Requirements: FR-DAY-01 to FR-DAY-04, FR-DAY-06 to FR-DAY-10, FR-DAY-13 to FR-DAY-15, FR-GAP-01 (positions only), NFR-ADV-01, NFR-SEC-01 (requirements 3.3, 3.8 and 4)

## Where it appears

- [The Day tab](../app/day.md): one day, its two readings with their positions as a gauge and a distance, and its entries. Its week sheet shows seven days side by side, with their average day.
- [The log sheet](../app/log-sheet.md): the estimates its estimate sheet adds to a day.
