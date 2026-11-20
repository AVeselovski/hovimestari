# Recipes

The place to keep your recipes, your saved meals and your own foods: to make a recipe from foods, find one, add a meal or a food, fix a typo, archive what you stopped making, or delete what you no longer want. It is the second tab, **Recipes**. The page keeps things. A recipe is put on a day from [its own page](recipe.md), and [the log sheet](log-sheet.md), which knows its day, logs meals and foods.

## In detail

### The three segments

A row of three segments sits at the top: **Recipes**, **Meals** and **Foods**. One shows at a time, Recipes to start with. The chosen one is in the accent. The segment is in the page's address, so Back and a reload keep it, and a press on the tab bar's **Recipes** comes back to Recipes.

Under the segments, in the same place whatever the segment, sit its one action and its search field:

- Recipes: **New recipe**, then "Search recipes".
- Meals: **New saved meal**, then "Search meals".
- Foods: **Add a food**, then "Search your foods".

Each search narrows its own list as you type, every word part of a name, whatever the case and the accents. Each segment keeps its own search while the page is open. A search that matches nothing says so, "No meal matches." or "No food matches.", with **Clear search**.

### Recipes

A row of chips first: **Favourites**, then every tag your recipes use, in Finnish order. A chip pressed narrows the list to the recipes that have it, and the chips chosen all hold together. The chosen ones are in the accent. **Favourites** shows while the list loads, so the tags joining it move nothing below.

Then your [recipes](../features/recipes.md#a-recipe) by name, in Finnish order. Each row shows the name, at most two lines, "Serves 2 · 25 min" when it has a time, and one serving's calories and protein, each figure after its dot: "365 kcal" and "21.8 g protein per serving". A favourite has a star at the row's end, and every row keeps that place. A row opens [the recipe's page](recipe.md).

With no recipes the list says "Recipes you save appear here.". When they cannot be read it says "Your recipes show here once Hovimestari can reach the server.". A search or a chip that matches none says "No recipe matches." with **Clear search and filters**, which empties the search and lets go of every chip.

**Archived recipes**, under the list, opens the archived recipes in place, read the first time it opens, and closes them again. The search narrows them too. With none it says "Recipes you archive appear here.".

**New recipe** opens [the recipe editor](#the-recipe-editor). A saved recipe opens its page.

### The recipe editor

A tall sheet, "New recipe" or "Edit recipe", that makes or changes a recipe. Top to bottom:

- **Name**.
- **Serves**, a whole number of servings from 1 to 100, 2 to start with, and **Time (optional)** in minutes, side by side.
- **Ingredients**: each line with its name, its note under it, and its amount in the monospaced face, such as "4 × Medium piece · 220 g", "2 cloves · 10 g" or "400 g". A line not counted reads "Not counted". A line opens to change it. Lines keep the order they were added in. With none, the line under the list says "Add at least one ingredient.". Then **Add ingredient** and **Add a line not counted**.
- The figures card: "Per serving" and "Whole recipe", worked out as the lines are typed, by the same computation the server runs, so they are the figures the save stores. With no line yet the card's figures are empty.
- **Method**, one step per line. "One step per line." under it.
- **Notes**.
- **Tags**: text and Enter, or a comma, make a tag, each with a cross that takes it off. Your other tags show under the field as chips to tap. At most 10.
- When editing, **Archive recipe** or **Restore recipe**, which turns in place.

**Save recipe** sends the whole recipe. **Cancel** closes it. When editing, **Delete** at the footer's start asks first, as [the page's delete](recipe.md#archive-and-delete) does. A refusal shows under its field. A refusal about one ingredient shows under that ingredient, its row marked. A line typed as a count of a portion that was removed since turns into its grams, says so under the line, and the next **Save recipe** passes. What a save does to the days that use the recipe is in [a recipe on a day](../features/recipes.md#a-recipe-on-a-day).

### Adding an ingredient

**Add ingredient** opens the ingredient picker over the editor: one tall sheet that finds a food and takes its amount, so its top edge never moves.

Its first line says "Adding to Shakshuka", with the recipe's name. Under it the food search, the same search as the log sheet's: typed words, a barcode typed or scanned with the camera, and **Add your own food**. With fewer than two letters it shows your favourite foods and your own foods. A food pressed opens its amount:

- **Back** and the food's name. **Change food** goes back to the search, and the amount typed is kept, in grams.
- The amount, as the log sheet takes it: grams, or a count of one of the food's portions, chosen with the chips. It opens on grams with the field empty. "Weigh it as it goes into the pot." under it.
- "For this amount" and the four figures.
- **As written**: a number and a unit from the fixed list, such as 2 cloves, for the recipe's own words. Both or neither.
- **Note**, such as chopped.

**Add** puts the line in the editor, behind the picker, and the picker goes back to its empty search with focus in the field. Its first line says "Added Fetajuusto, 60 g." for a few seconds. Five ingredients are five searches and five amounts, with no sheet opening or closing. **Done** closes the picker.

A line opened from the editor opens the picker on its amount, its first line "Changing an ingredient of Shakshuka", with **Save** and **Remove ingredient**.

### A line not counted

**Add a line not counted** opens "Line not counted": a name, such as salt, its amount as written and a note. "Not counted lines add no figures. Use them for water, salt and spices." over the fields. **Add**, or for a line opened from the editor **Save** and **Remove**.

### Meals

Your [saved meals](../features/saved-meals.md#a-saved-meal) by name. Each row shows the name, the source when it has one, and "640 kcal · 42.0 g protein per meal". A row opens the meal's edit sheet, "Edit saved meal". With no meals the list says "Meals you save appear here.". When the meals cannot be read it says "Your saved meals show here once Hovimestari can reach the server.".

**New saved meal** opens the saved meal sheet with no day, so it saves only. It asks for the name, where the meal comes from and its figures per meal, as the log sheet's [new saved meal](log-sheet.md#a-new-saved-meal) does, but without Eaten or planned. The edit sheet saves an edit with **Save meal**, and the row changes in place or moves to its new place by name. At the end of its form it has **Archive meal**, or **Restore meal** for an archived meal. The press keeps the sheet open, and the button turns into the other one where it is, with focus on it. When an archive or a restore fails, the sheet's own error line says why.

**Delete**, in the sheet's footer, asks first: "Delete Chicken bowl?" with "Days it was logged on keep their figures." and **Delete**. After the delete both close, and focus moves to the next meal, else the one before, else **New saved meal**. What a delete does to the days that used the meal is in [archiving and deleting](../features/saved-meals.md#archiving-and-deleting).

**Archived meals**, under the meals, opens the archived list in place and closes it again. Each row opens the meal's edit sheet, with **Restore meal**, and carries **Restore** at its end. A restore that fails there says why in a toast. With none, the list says "Meals you archive appear here.".

### Foods

Your [own foods](../features/foods.md#your-own-foods) by name, each with its energy and protein per 100 g, and a star when it is a favourite. A row opens "Edit food" on the food's saved values at once when the app read them in the last 30 seconds and no change has come in since. Offline it opens on the values the app last read. Otherwise it reads them first, and the row stays pressed with a turning ring in the star's place until the sheet opens. Pressing anything else that opens a sheet meanwhile wins. A food deleted on another device leaves the list, and a toast says "This food is no longer available.". With no foods the list says "Foods you add appear here.". When they cannot be read it says "Your foods show here once Hovimestari can reach the server.".

**Add a food** opens the own-food sheet. **Delete**, in the food's sheet, asks first. After the delete focus moves to the next food, else the one before, else **Add a food**.

## How it works

### Route and entry

The page is `/recipes?show=recipes|meals|foods`, the second tab of [the app shell](shell.md). It is `RecipesTab.tsx` in `apps/web/src/components/recipes/`, rendered inside Suspense since it reads the address. The recipes segment is `RecipeList.tsx` with `RecipeRow.tsx`, the meals and foods `SavedMealsSection.tsx` and `OwnFoodsSection.tsx`. The editor is `RecipeEditorSheet.tsx` with `IngredientRows.tsx`, `RecipeFigures.tsx`, `TagField.tsx`, `NotCountedSheet.tsx`, `WrittenFields.tsx` and the draft in `recipeDraft.ts`. The picker is `IngredientPicker.tsx`, built on `useFoodFinder` as [the log sheet](log-sheet.md#route-and-entry) is.

### Layout

One column at every width, in the shell's page column. The segments are `segmentedTray` in equal thirds, 58 pixels tall with their buttons 48. The action is one `btnWide`, 48 pixels. The rows are at least 56 pixels tall. Measured on a production build at 320 by 568, 390 by 844 and 1280 by 800, in both themes, the segments, the action and the search field hold their boxes to the pixel across the three segments, loading, an empty list, a list that cannot be read and a search that matches none, and the chip row holds to the pixel from loading to loaded and while a chip is pressed. At 390 the segments start 85 pixels down, the action 159 and the search field 223, and at 1280 108, 182 and 246. The chip row scrolls sideways on a phone and wraps from `md`.

The editor is a [`FormSheet`](shell.md#the-sheet-primitives) with `size="tall"` and the `md:max-w-xl` dialog. The picker is a `BottomSheet` with `size="tall"` stacked on it, and the own-food sheet and the scanner stack on the picker, three deep. Measured on a production build, the picker's top edge holds to the pixel across its search, a food's amount and five adds, at 48 pixels down at 320 and 390 wide and 16 at 1280. With an emulated keyboard of 40 per cent of the screen and **Method** focused, **Save recipe** ends 16 pixels above the keyboard at 320 by 568 and at 390 by 844, and the method box stays above the footer.

### Data and refresh

The recipes are read once, active, then the archived ones when they open, and filtered and sorted on the device with `filterRecipes` and `sortRecipes`, as [finding a recipe](../features/recipes.md#finding-a-recipe) describes. The meals and foods lists read the same cached queries as the log sheet. A recipe save puts its answer into the lists and the recipe's page first, through `apps/web/src/lib/recipeCache.ts`, then `afterRecipeSaved` in `apps/web/src/lib/invalidation.ts` reads again what only the server knows. An own-food edit or delete reads the recipes again, since their figures follow their foods. A meal write follows [the rules for writes from the web app](../features/saved-meals.md#writes-from-the-web-app).

### Known gaps

- A user with more than 200 own foods sees the first 200 by name.
- The recipes have no sort but by name, and no filter by figures, on screen.

## Features on this page

- [Recipes](../features/recipes.md): the recipes, the archived ones, and new, edit, tags and the figures as typed.
- [Saved meals](../features/saved-meals.md): the meals, the archived meals, and new, edit, archive, restore and delete.
- [Foods](../features/foods.md): the user's own foods, add, edit and delete, and the food search the picker uses.
