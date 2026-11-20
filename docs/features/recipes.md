# Recipes

A recipe is a dish a person cooks again and again, written once with its servings, its ingredients and its method. The app computes its figures from the foods its ingredients point at, so a person never types a recipe's totals.

Recipes are kept through the API and by a connected assistant. They have no screen yet, and a recipe cannot be put on a day yet.

## In detail

### A recipe

A recipe has a name of at most 120 characters and makes 1 to 100 servings, a whole number. It may have a cooking time of 1 to 1440 minutes, a method of up to 40 steps of at most 1000 characters each, notes of at most 2000 characters and up to 10 tags. It has 1 to 60 ingredient lines. Only its owner sees a recipe.

### Ingredient lines

A line is either counted or not counted.

A counted line points at a food and its weight in grams, such as 400 g of crushed tomatoes. The weight may be typed as a count of one of the food's portions, such as 4 medium eggs, and the app turns the count into grams as it does for a food on a day. A line's food is any food the person can see: a Fineli food, a product kept from Open Food Facts, or one of their own foods.

A line not counted has a name of at most 80 characters and adds nothing to the figures. Water, salt and spices go in this way.

Either kind of line may carry the amount as the recipe writes it, such as "2 cloves", beside the grams. The unit comes from a fixed list: g, kg, ml, dl, l, tsp, tbsp, piece, clove, slice, can, pack, jar, bunch, pinch and handful. A line may also carry a note of at most 80 characters, such as "chopped". Lines keep the order they are given in.

### A recipe's figures

A recipe's figures are computed from its counted lines and its servings every time it is read, from its foods as they are now. Two figures are shown. **Per serving** is one serving. **Whole recipe** is all of its servings, exactly what a day would show for all of them logged as one entry.

The values of every counted line are added up exactly, divided by the servings and rounded once. A whole recipe is never the sum of its lines rounded one by one. In a shakshuka for 2 of 240 g of egg, 400 g of crushed tomatoes, 60 g of feta and 15 g of olive oil, one serving is 365 kcal and 21.8 g of protein, and the whole recipe 730 kcal and 43.6 g. Its lines rounded one by one would add up to 43.5 g.

One serving may come to at most 10000 kcal and 1000 g of protein, carbohydrates or fat, the most a typed figure can be. A recipe past that is refused.

### Another number of servings

A recipe can be read at another number of servings, from 1 to 100. Every line's grams, portion count and written amount follow: grams to one decimal, counts and written amounts to two. The figures at that size come from one serving's figures, not from the rounded amounts, so the shakshuka at 3 servings is 1095 kcal and 65.3 g of protein.

### Tags and favourites

Tags are the person's own words, each 1 to 30 characters, kept as typed. A recipe holds a tag once, compared without case: "Brunch" and "brunch" are one tag, and the first spelling stays. The limit of 10 counts the tags as sent, a repeat included. A recipe can be marked as a favourite and taken off again.

### Finding a recipe

The recipes are listed active or archived, and filtered and sorted in one way wherever they are read. Every typed word must be part of the name or a tag, whatever the case and the accents, so "pahkina" finds "Pähkinäpuuro". Asked for tags, a recipe must have every one. A recipe can be asked for by its figures for one serving, at least or at most an amount of protein or energy, compared as they are shown, so "at least 30 g" keeps a recipe that shows 30.0 g. The bound is taken as typed, so "at least 22.34 g" leaves out a recipe that shows 22.3 g. The favourites can be asked for alone.

They sort by name in Finnish order, where å, ä and ö come after z, by the latest day they are on, by protein, most first, or by energy, fewest first. Ties go by name. The latest day a recipe is on is empty until recipes can be put on days.

### Archiving and deleting

Archiving a recipe moves it from the list to the archived list, and it can be restored. An archived recipe can still be read.

Deleting a recipe deletes it with its lines and tags.

### When a food changes

A recipe's figures follow its foods. When the person edits one of their own foods, or a Fineli import changes a food's values, the recipe shows the new figures the next time it is read.

An own food that a recipe line uses is hidden when the person deletes it, as an own food that days use is. The line keeps it and computes with its values, and the line's food is marked as deleted. A Fineli food the import retires, or a product taken down from Open Food Facts, stays on its lines and is marked as retired. A recipe with such a line says so.

A line already on a recipe keeps its food when the recipe is saved again, even when the food is hidden or retired since. A new line, or a line that swaps its food, needs a food the person can see now.

## How it works

### The figures in code

`recipeBasis` in `packages/types/src/recipeFigures.ts` computes one serving's basis from the counted lines and the servings, in integers: each line's values per 100 g in thousandths times its grams in tenths, added up exactly, divided by the servings and rounded once, halves away from zero, to two decimals for energy and three for grams. That is the precision an entry stores. Per serving is `entryFigures(basis, { per: "serving", count: 1 })` and the whole recipe `entryFigures(basis, { per: "serving", count: servings })`, through the one figure function every entry uses. `scaleRecipe` scales a recipe's lines to another number of servings. A preview computes a draft's figures with the same functions, so a preview is the figure that is saved.

### Finding recipes in code

`filterRecipes` and `sortRecipes` in `packages/types/src/recipeFilter.ts` are the one filter and the one sort. `listRecipes` reads every active or archived recipe of the person, computes each one's figures and runs both. `fold` there lowers the case and takes the accents off, and the log sheet's meal filter uses it too. A sort by name uses `localeCompare` with Finnish rules.

### Saving a recipe

A save checks every line before it writes, and a refused line names itself: the refusal carries `line`, the line's index from 0. `checkLine` in `apps/backend/src/services/recipeValues.ts` checks one line: its food is there, a count is of one of the food's own portions that the person can see, and the grams come to more than zero and at most 5000. A preview runs the same check on every line, so a preview that passes is a save that passes.

A create or an edit takes the user's row, then the recipe's row, then the person's own foods among its lines `FOR SHARE`, in one statement in food id order (`readLineFoods`), and only then reads the foods' values. An own food's edit or delete therefore waits for the save, or the save waits for it and reads the food as it is then. A delete that goes first leaves the save a line on no food, which answers `food_not_found` at that line. A save that goes first makes the delete find the food on a recipe and hide it. Fineli foods and kept products are not locked. A person never edits or deletes them. The Fineli import changes their values, and a save never waits on it.

An edit replaces the lines and the tags as sent. A line keeps its id across edits. A line sent under an id the recipe does not hold keeps the id of a line the recipe holds whose id no other line sends and that is the same in every part but its place. The first such line is taken, and each line once, so two identical lines pair one to one. A whole recipe sent again with new ids is then the same recipe, and moving lines is a change of order. The answer then holds ids other than the ones sent, so a client keeps the answer's ids for its next save. An edit that changes nothing writes nothing and answers as unchanged, even when an own food edited since takes a serving past the cap. An edit that changes anything is refused past the cap. Archiving and the favourite are one update of the recipe's own row each.

### Services

`apps/backend/src/services/reads/recipes.ts` has `listRecipes`, `getRecipe` and `previewRecipe`. `getRecipe` answers an archived recipe too, and with `servings` it adds `scaled`. `apps/backend/src/services/writes/recipes.ts` has `createRecipe`, `updateRecipe`, `setRecipeArchived`, `setRecipeFavourite` and `deleteRecipe`. A create carries an id the client chose, so a repeat answers the recipe again and ignores its body. Another user's recipe answers 404 `recipe_not_found` on every route that takes a recipe's id. A connected assistant reads, previews, creates, edits and archives recipes and marks them as favourites through these same services, each change recorded in the same transaction, as [what an assistant can change](connected-ai.md#what-an-assistant-can-change) describes. It cannot delete one.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`, and `line` too when the refusal is about one line.

| Method      | Path                                                                                                    | Answers                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET         | `/recipes?archived=&q=&tags=&minProteinG=&maxProteinG=&minEnergyKcal=&maxEnergyKcal=&favourites=&sort=` | 200 `{ recipes }`, each a summary. Every filter is optional. `archived` and `favourites` take `true` or `false`. `tags` may repeat. `sort` is `name`, `lastPutOn`, `protein` or `energy` |
| GET         | `/recipes/:id?servings=`                                                                                | 200 with the recipe, archived or not, and with `servings` from 1 to 100 also `scaled`. 404 `recipe_not_found`                                                                            |
| POST        | `/recipes`                                                                                              | 201 with the recipe, 200 on a repeat. Takes `{ id, name, servings, timeMinutes, lines, steps, notes, tags }`. 409 `recipe_id_taken` or `ingredient_id_taken`                             |
| POST        | `/recipes/preview`                                                                                      | 200 with what a draft comes to. Takes `{ servings, lines }`. Writes nothing                                                                                                              |
| PUT         | `/recipes/:id`                                                                                          | 200 with the recipe. Takes the whole recipe without its id. 404. 409 `ingredient_id_taken`                                                                                               |
| PUT, DELETE | `/recipes/:id/archived`                                                                                 | 204, archives or restores, also when it already is. 404                                                                                                                                  |
| PUT, DELETE | `/recipes/:id/favourite`                                                                                | 204, marks or unmarks, also when it already is. 404                                                                                                                                      |
| DELETE      | `/recipes/:id`                                                                                          | 204. 404                                                                                                                                                                                 |

A line in a body is `{ id, counted: true, foodId, amount, written, note }` or `{ id, counted: false, name, written, note }`. `amount` is `{ grams }` or `{ portionId, count }`, as an entry takes it, and `written` is `{ amount, unit }` or null. Line ids are chosen by the client and kept across edits. A preview's lines may leave the id out.

A summary has `id`, `name`, `servings`, `timeMinutes`, `tags`, `favourite`, `archived`, `perServing`, `basis` (one serving at the precision an entry stores), `lastPutOn`, `lastServings`, `imageId` and `foodsGone`, which says a line's food is deleted or retired. `lastPutOn`, `lastServings` and `imageId` are null until recipes can be put on days and have images. A recipe adds `deleted`, `whole`, `lines`, `steps` and `notes`. A line in an answer has `id`, `position`, `counted`, `food` (its id, name in the person's food-name language, source, values per 100 g, `retired` and `deleted`), `name`, `grams`, `portion`, `written` and `note`. `scaled` is `{ servings, lines, figures }`.

A preview answers, for every line by its `index`, the food's name as the app reads it, the `grams` the app would store, the `portion` a count was of and its `refusal`, then `perServing`, `whole`, `basis` and the draft's own `refusal`. The figures are null while a line or the draft is refused, and a serving past the cap is the draft's refusal, `recipe_serving_too_large`.

A refused recipe answers `name_required`, `name_too_long`, `recipe_servings_invalid`, `recipe_time_invalid`, `recipe_lines_required`, `recipe_lines_too_many`, `step_too_long`, `steps_too_many`, `notes_too_long`, `tag_invalid`, `tags_too_many` or `recipe_serving_too_large`. A refused line answers `line_name_required`, `line_name_too_long`, `line_note_too_long`, `written_amount_invalid`, `entry_grams_invalid`, `entry_count_invalid`, `food_not_found` or `portion_not_found`, with its `line`. The shapes are in `packages/types/src/recipes.ts`.

### Data

- `recipes`: `user_id` cascading from `users`, `name`, `servings`, `time_minutes`, `steps` as an array of text, `notes`, `favourite_at`, `archived_at`, `deleted_at`, and CHECKs on each limit. The unique constraint `recipes_id_user_uq` on `(id, user_id)` is what the lines and the tags point at, so a line is always its recipe's owner's.
- `recipe_ingredients`: one row per line, with an id the client chose, `recipe_id` and `user_id` cascading from the recipe, `position` from 0, unique per recipe. A counted line has `food_id`, cascading from `foods`, and `grams`. A line not counted has `name` and neither. The CHECK `recipe_ingredients_kind` holds that. `portion_id`, `portion_count`, `portion_unit` and `portion_name` keep how the grams were entered, as on an entry, with `portion_id` read only while it is still the food's portion and visible. `written_amount` and `written_unit` come together. `note` is optional. `recipe_ingredients_food_idx` finds the lines on a food.
- `recipe_tags`: `recipe_id` and `user_id` cascading from the recipe, and `tag`. The unique index `recipe_tags_uq` on `(recipe_id, lower(tag))` keeps a tag once per recipe, by the database's own lower case. A save skips a tag the index finds taken, so a pair the database folds alike keeps the first spelling.

Every table cascades from `users`, so deleting an account removes its recipes with their lines and tags.

### Known gaps

- A line typed as a count of one of the person's own portions is checked again on every save, so once that portion is removed, saving the recipe with the line unchanged is refused at that line.
- A preview checks lines against the foods the person can see now, so it refuses a line on a food hidden since that a save would keep.
- A recipe has no cover image yet, and cannot be duplicated yet.

Requirements: FR-REC-01 to FR-REC-09, FR-AI-06, FR-AI-07 (requirements 3.7 and 3.10)

## Where it appears

- [Settings](../app/settings.md#activity): an assistant's changes to recipes, in a connection's Activity.
