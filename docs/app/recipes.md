# Recipes

The place to keep your saved meals and your own foods: to add one, fix a typo, archive a meal you stopped ordering, or delete what you no longer want. It is the second tab, **Recipes**. The page keeps things, and [the log sheet](log-sheet.md), which knows its day, logs them.

## In detail

### The two actions

Two buttons of the same size sit side by side at the top: **New saved meal** and **Add a food**. They stay in that place however many meals and foods the page holds, and whether the archived meals are open. On a narrow phone "New saved meal" wraps to two lines, and **Add a food** grows with it, so the two stay the same height.

**New saved meal** opens the saved meal sheet with no day, so it saves only. It asks for the name, where the meal comes from and its figures per meal, as the log sheet's [new saved meal](log-sheet.md#a-new-saved-meal) does, but without Eaten or planned. **Save meal** saves it, and the meal shows in its place by name. **Add a food** opens the own-food sheet, as **Add your own food** does in the log sheet.

### Saved meals

Your [saved meals](../features/saved-meals.md#a-saved-meal) by name. Each row shows the name, the source when it has one, and "640 kcal · 42.0 g protein per meal". A row opens the meal's edit sheet, "Edit saved meal". With no meals the section says "Meals you save appear here.". When the meals cannot be read it says "Your saved meals show here once Hovimestari can reach the server.". While they load, the heading, one empty line's room and **Archived meals** show.

The edit sheet saves an edit with **Save meal**, and the row changes in place or moves to its new place by name. At the end of its form it has **Archive meal**, or **Restore meal** for an archived meal. The press keeps the sheet open, and the button turns into the other one where it is, with focus on it. That turn is the undo, and no toast follows. The row moves between the two lists under the sheet. When an archive or a restore fails, the sheet's own error line says why, such as "Could not confirm. Try again." or "You are offline.".

**Delete**, in the sheet's footer, asks first: "Delete Chicken bowl?" with "Days it was logged on keep their figures." and **Delete**. The question opens over the edit sheet. After the delete both close, the meal leaves the page, and focus moves to the next meal, else the one before, else **New saved meal**. What a delete does to the days that used the meal is in [archiving and deleting](../features/saved-meals.md#archiving-and-deleting).

### Archived meals

**Archived meals**, under the saved meals, opens the archived list in place and closes it again. The list is read the first time it opens. Each row opens the meal's edit sheet, with **Restore meal**, and carries **Restore** at its end, which puts the meal back in the saved meals at once. A restore that fails there says why in a toast, since no sheet is open. With none, the list says "Meals you archive appear here.".

### Your foods

Your [own foods](../features/foods.md#your-own-foods) by name, each with its energy and protein per 100 g, and a star when it is a favourite. Every row here is yours, so a row shows only the name, the figures and the star. A row opens "Edit food" on the food's saved values at once when the app read them in the last 30 seconds and no change has come in since. Offline it opens on the values the app last read. Otherwise it reads them first, and the row stays pressed with a turning ring in the star's place until the sheet opens. So the form starts from what is saved now, also after an edit on another device or by a connected assistant. Pressing anything else that opens a sheet meanwhile wins, and the food's sheet stays shut. When that read fails, a toast says why and the sheet stays shut. A food deleted on another device leaves the list, and the toast says "This food is no longer available.". It leaves the list also when another sheet opened while the read was out, and then no toast shows. With no foods the section says "Foods you add appear here.". When they cannot be read it says "Your foods show here once Hovimestari can reach the server.". While they load, the heading and one empty line's room show.

**Delete**, in the food's sheet, asks first, as in the log sheet. After the delete focus moves to the next food, else the one before, else **Add a food**.

A favourite is marked in the food's view in the log sheet. Its star here only shows it.

### A new account

With nothing saved yet, the page shows the two actions, the two empty lines and **Archived meals**, and nothing else.

## How it works

### Route and entry

The page is `/recipes`, the second tab of [the app shell](shell.md). It is `apps/web/src/components/recipes/RecipesTab.tsx`, with `SavedMealsSection.tsx` and `OwnFoodsSection.tsx` beside it.

### Layout

One column at every width, in the shell's page column, so the header's title and rule line up with it. The two actions are one grid row of equal halves (`actionPair` in `apps/web/src/components/ui/styles.ts`), at least 48 px tall. The rows are the log sheet's rows, at least 56 px tall. Each row tells a screen reader "Opens it to edit." after its name. While a list loads it keeps the room of one empty line, 48 px, so an empty list arrives without moving anything. The action row and the first heading never move from loading to loaded. The page keeps a toast's room at its end.

The sheets are the log sheet's own, here as top-level sheets: `SavedMealSheet` without its logging part and with its archive button, and `OwnFoodSheet`. Below `md` they come up from the bottom, and from `md` they are dialogs. Each delete question is stacked on its own sheet. The meal sheet's footer holds **Delete** on its own row over **Cancel** and **Save meal** on a phone, and at the start of their row from `md`.

### Data and refresh

The lists read the same cached queries as the log sheet: the active and the archived saved meals, and the own foods, 200 at most. A meal write follows [the rules for writes from the web app](../features/saved-meals.md#writes-from-the-web-app). A food write runs through `afterOwnFoodSaved` and `afterFoodGone` in `apps/web/src/lib/invalidation.ts`. Each puts its answer into those lists first and then reads again what only the server knows. So a change on this page shows in the log sheet, and the reverse, without a reload.

### Known gaps

- The page has no filter. The log sheet's search finds a meal or a food by name.
- A user with more than 200 own foods sees the first 200 by name.

## Features on this page

- [Saved meals](../features/saved-meals.md): the meals, the archived meals, and new, edit, archive, restore and delete.
- [Foods](../features/foods.md): the user's own foods, and add, edit and delete.
