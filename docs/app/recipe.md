# A recipe

One recipe on a page of its own: what goes in it, what one serving and the whole recipe come to, the same at any number of servings, and the way to put servings on a day. It opens from a row on [the Recipes tab](recipes.md), and from Open recipe in a recipe entry's sheet on [the Day tab](day.md#the-entry-sheet).

## In detail

### The top

**Back** at the start of the first row, and **Edit** at its end. Back returns to where the page was opened from, the list as it was or the day. A page opened by its address goes back to the Recipes tab.

Then the name in the display face, with the favourite star at its end, which marks the recipe at once. Under it "Serves 2 · 30 min", the tags, and "On a day Sat 21 Nov", the latest day the recipe is on, when it has been on one. An archived recipe says "Archived. It can still be logged." under them.

### Servings and figures

The figures card. First **Servings**, with **Back to 2** at the row's end once the servings differ from the recipe's own, then a stepper: a minus, the number and a plus. The number takes a whole number from 1 to 100 typed too, and keeps the last one while the field holds anything else.

Then a table, a row per figure with its dot: calories, protein, carbohydrates and fat. The first column is one serving, "Per serving". The second is "Whole recipe", or "For 4 servings" once the stepper is at 4. The figures are [the recipe's figures](../features/recipes.md#a-recipes-figures), and at another number of servings [the scaled ones](../features/recipes.md#another-number-of-servings), exactly what a day shows for that many servings as one entry.

### Log

**Log** opens "Log Shakshuka": **Eaten or planned**, **Date**, today to start with, **Servings**, the last servings eaten or else 1, and "For this amount" with the four figures. A future date takes Planned only, with "Future days hold planned entries." under the date, and the button reads **Add to plan**. One serving shows the page's per serving. After the add the sheet closes and a toast names the day, such as "Added Shakshuka to the plan for Sat 21 Nov.", with **Undo**. A log today reads "Logged Shakshuka, 1 serving.".

### Ingredients, method and notes

**Ingredients**: the lines as [the editor](recipes.md#the-recipe-editor) shows them, scaled with the stepper, so 4 eggs at 2 servings are 8 at 4. A line not counted reads "Not counted". A line whose food is gone says "This food was deleted.", "No longer in Fineli." or "No longer on Open Food Facts." under its name. **Method** lists the steps by number. **Notes** shows the notes as typed, their line breaks kept. A heading shows only when it has something under it.

### Archive and delete

At the end, three text buttons: **Duplicate**, **Archive recipe** or **Restore recipe**, and **Delete recipe**.

**Duplicate** opens the editor as a new recipe filled in from this one, with its name. Saved, the copy opens its own page. **Archive recipe** moves the recipe to the archived list and says "Archived Shakshuka." in a toast, and the button turns into **Restore recipe**. **Delete recipe** asks first, "Delete Shakshuka?" with "Days it was planned or eaten on keep their figures.", then leaves for the Recipes tab, where the next recipe by name takes focus, and says "Deleted Shakshuka.". What a delete does to the days is in [archiving and deleting](../features/recipes.md#archiving-and-deleting).

### Other states

- Opened from a row, the name, the servings and the figures show at once from the list, and the rest as the recipe is read.
- A recipe that is not there, or another person's, says "This recipe is no longer available." with **Back to recipes**.
- Offline and never read, the page says "This recipe needs a connection.".
- A deleted recipe, opened from a day, says "This recipe was deleted. Days it was on keep their figures." and offers no Edit, Log, star, Duplicate, Archive or Delete.

## How it works

### Route and entry

The page is `/recipes/[id]`, `apps/web/src/app/(app)/recipes/[id]/page.tsx`, which renders `RecipePage.tsx` in `apps/web/src/components/recipes/`. [The tab bar](shell.md#the-tabs) shows it under Recipes. `RecipeLogSheet.tsx` is its log sheet, and `useRecipeActions.ts` and `useRecipeDelete.ts` its favourite, archive and delete. `apps/web/src/lib/recipeNav.ts` keeps, for the page's life only, whether the page was opened from inside the app, and how far the list was scrolled.

### Layout

One column in the shell's page column, opening at its top whatever the page before it scrolled. The figures card is `RecipeFigures.tsx`. Each figure keeps one line at every number of servings up to 100, in the monospaced face, smaller on a phone, and **Back to 2** keeps its room while hidden. Measured on a production build at 320 by 568, 390 by 844 and 1280 by 800, the card and **Log** under it hold their boxes to the pixel across 2, 3, 4 and 5 servings, 100, 37 and 1 typed, and **Back to 2**. On a phone the table names carbohydrates "Carbs", and "Carbohydrates" aloud and from `md`. Ingredient rows put the amount under the name on a phone, and in a column of its own before the name from `md`.

### Data and refresh

The page reads `GET /recipes/:id` and scales on the device with `scaleRecipe` and `entryFigures` on the recipe's basis, which is how [the server scales](../features/recipes.md#another-number-of-servings). The log sheet's add goes through `useEntryActions`, so the day it lands on is in the cache when the Day tab opens it. The favourite turns at once and back on a failure. A delete keeps the page's own read from running again while the page leaves.

## Features on this page

- [Recipes](../features/recipes.md): the recipe, its figures and their scaling, archiving, deleting and copying.
- [Quick logging](../features/quick-logging.md): putting servings on a day, with Undo.
