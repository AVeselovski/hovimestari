# The as made sheet

The sheet that logs a recipe as it was really made: one batch, with its own ingredients and the servings it gave, and the days its servings are on. It is for the time the dish came out different from the recipe, such as more feta, no oil, spinach added, or three servings where the recipe makes two. It opens from **Log as made** in three places: a recipe entry's sheet on [the Day tab](day.md#the-entry-sheet), the recipe view of [the log sheet](log-sheet.md#a-recipe), and [a recipe's page](recipe.md#log).

## In detail

### The top

The title names the recipe, "Log Shakshuka as made", two lines at most. Then two fields:

- **Made on**: the day the batch was made. It starts as the day of the entry the sheet opened from. Opened from the log sheet it starts as the day that sheet logs to, and from a recipe's page as today.
- **It gave**: the servings the batch gave, a whole number from 1 to 100. It starts as the recipe's own, and the line under it says "The recipe makes 2.".

### Ingredients

The recipe's lines, as [the recipe editor](recipes.md#the-recipe-editor) shows them. The recipe itself never changes here. A tap on a line opens [the ingredient picker](recipes.md#adding-an-ingredient) on its amount, where the amount, the food, the written amount and the note can change. Its header says "Changing this batch of Shakshuka". A line not counted opens its own sheet.

Each line says what the batch did with it, in a muted line under its amount:

- "Changed. Recipe: 60 g" on a line that differs from the recipe's. It shows the recipe's amount, and the recipe's food with it when the food changed, such as "Changed. Recipe: Feta, 60 g".
- "Added" on a line the recipe does not have.

**Leave out**, at the start of the picker's footer, takes a recipe's line out of the batch. It is drawn in ink, as a plain action, since it deletes nothing. The line stays in its place, struck through and muted, with **Put back** where its arrow stood, and its figures leave the batch. A line that was changed before it was left out reads "Left out. Recipe: 60 g". **Put back** returns the line as it was. A line the batch added has **Remove ingredient** instead, which takes it away.

**Add ingredient**, under the lines, opens the picker to find a food and take its amount, as in the editor. Its header says "Adding to this batch of Shakshuka". A batch with every line left out is refused with "Add at least one ingredient.".

What counts as changed, added and left out is in [logging as made](../features/recipes.md#logging-as-made).

### Figures

The figures card of [a recipe's page](recipe.md#servings-and-figures) without its stepper: "Per serving" and "Whole batch", a row for calories, protein, carbohydrates and fat. They follow the lines and **It gave** as they change, and they are the figures the batch is stored with. While **It gave** holds no whole number from 1 to 100 the figures are empty. Under them, muted, the recipe's own serving: "Recipe: 365 kcal · 21.8 g protein per serving".

### Servings from this batch

The days the batch's servings are on. A batch needs at least one serving, ticked or added, and takes 20 at most.

- Opened from an entry, that entry comes first, as its day and servings, such as "Sat 21 Nov · 1 serving", with **Eaten or planned**. Eaten is chosen to start with, so one press logs the batch and marks the serving eaten. On a day after today only Planned can be chosen, and "Future days hold planned entries." says why.
- Opened with no entry, a first row of new servings stands in its place: **Date**, **Servings** and **Eaten or planned**. From a recipe's page it starts with today, 1 serving and Eaten. From the log sheet it starts with that sheet's day and the servings and the state its log block holds.
- **Add servings on another day** adds a row under itself: a date, 1 serving, and **Eaten or planned**. The date starts as the first day from **Made on** that holds no serving of the recipe on the sheet, listed, ticked or added. **Remove these servings** takes a row away, the first row too.
- "Other planned servings of Shakshuka" lists the plain planned servings of the recipe on the batch's day and the six days after, each a checkbox with its day and servings, none ticked. The line under the heading says what a tick does: "A ticked serving takes this batch's figures and stays planned.". Changing **Made on** changes the days the list looks at. While those days are read, the list and its ticks stay as they were. With none, the heading is absent too.

A planned serving ticked can be the whole batch: remove the first row and the batch adds no new entry. A row with a date and no servings is refused under that row.

**Log as made** waits, dimmed, in four cases:

- The app is still asking what today is, as the page first loads.
- The batch has no serving. The section's last line says what to do: "Enter servings on at least one day." while a row is empty, "Add servings on a day, or tick a planned serving." with no row and planned servings listed, and "Add servings on at least one day." with neither.
- The batch holds more than 20 servings. At 20 the line says "A batch takes 20 servings at most.", **Add servings on another day** is dimmed and an unticked serving cannot be ticked.
- A serving is ticked and the days the list reads are being read again after **Made on** changed.

### Logging it

**Cancel** and **Log as made** stay at the foot of the sheet. **Log as made** stores the batch and its servings in one go: the entry it opened from and each ticked serving take the batch's figures, the opening entry takes the state chosen, and each row becomes a new entry. Then the sheet closes, with the sheet it opened from, and a toast says "Logged Shakshuka as made.". When the batch's servings are on more than one day the toast names them: "Logged Shakshuka as made, on 2 days.". The toast has no Undo. Each serving is undone from its own entry.

When a press gets no answer, the batch may have been stored all the same. The sheet stays open, and the next press stores nothing twice. If the batch on screen is the one that was stored, the sheet closes as logged. If it was changed in between, the sheet stays and the line above the buttons says "This batch was already logged as it was first sent. Press Cancel to see it on the day.". **Cancel** then closes the sheet it opened from too, and the day shows the batch as it was stored.

A refusal shows where it belongs, and the sheet stays open with what was typed:

- Under **Made on**, **It gave** or a row's field for a value that field cannot take, such as "Enter a whole number of servings from 1 to 100.".
- Under an ingredient for a refusal that names it, such as "This food is no longer available." for a food deleted since it was added.
- Under the figures when one serving comes to more than an entry can hold.
- In the line above the buttons for anything else, such as "One of these servings can no longer be added to this batch. Close this and open it again." when a serving changed on another device, "This could not be logged. Try again." when the next press will go through, or "You are offline. Changes need a connection.".

Escape, a press outside and a drag close the sheet while nothing in it has changed. Once something has, only **Cancel** and **Log as made** leave it. Closing it puts focus back on the **Log as made** that opened it.

### On a phone

The sheet covers nearly the whole screen and its body scrolls between the title and the buttons. A line's amount sits under its name, and what the batch did with the line under the amount. A row of new servings stacks its date over its servings. The body takes focus as the sheet opens, so no keyboard rises until a field is tapped. With the keyboard up the buttons ride above it.

## How it works

### Route and entry

The sheet is `CookSheet.tsx` in `apps/web/src/components/recipes/`, a [form sheet](shell.md#the-sheet-primitives) at the tall size. `useCookSheet.tsx` is the one way in for the three places: each calls its `open` from **Log as made** and renders its `sheet`, stacked on the entry sheet or the log sheet, or on its own on the recipe's page. `CookIngredients.tsx` draws the lines with the editor's `IngredientRows.tsx`, and `CookServings.tsx` the section Servings from this batch. `CookLineSheets.tsx` holds the two sheets a line opens in: the editor's `IngredientPicker.tsx` and `NotCountedSheet.tsx`, given the words a batch needs. `cookDraft.ts` holds the batch as it is typed and builds the request.

A batch starts from the recipe's lines, so the recipe is read before the sheet opens when the device holds no copy from the last 30 seconds, and **Log as made** shows it is busy meanwhile (`apps/web/src/lib/recipeRead.ts`). Nothing in the sheet is filled in after it opens. A read that fails opens nothing and says why where that place shows its failures: the entry sheet above its buttons, the log sheet on its status line, the recipe's page in a toast.

The read can answer after the place that asked has moved on. Each place is asked again when the answer arrives, and the sheet opens only where it still fits: an entry sheet with no unsaved change, no save and no removal under way, a log sheet still on that recipe's view, a recipe page with no other sheet open or opening. A later press takes the place of an earlier one. On a recipe's page **Log as made** waits while the app does not yet know today.

In an entry's sheet **Log as made** waits on unsaved changes as **Open recipe** does. A serving that is already from a batch, and an entry of a deleted recipe, have no **Log as made**.

### Layout

The sheet holds one height, so its top edge and its buttons stay where they are while lines change. From `md` it is a dialog 576 pixels wide. Every ingredient row of the sheet ends in one slot 68 pixels wide, which holds the row's arrow or **Put back**, so a name takes the same lines whether its line is left out or not. A line left out shows every line of text it showed before, so its row keeps its height and no row above or under it moves. The marks are one muted line each. A line that becomes changed grows by that line, 20 pixels, and the rows under it move down by it. The figures card keeps its box whatever **It gave** holds, and is filled on the sheet's ground whether the sheet is stacked or on its own.

The other planned servings are the section's last block, and **Add servings on another day** adds its rows under itself, so neither a list that arrives nor a new row moves a control that was just pressed.

Measured on a production build at 320 by 568, 390 by 844 and 1280 by 800, in both themes, through a whole batch: a line changed, one left out, put back and left out again, one added, **It gave** emptied and set to 3, and the other servings arriving 2.5 seconds late. The sheet's box and its buttons differ by 0 pixels across all of it. No row moves when a line is left out or put back: measured over every row of a recipe of 25 lines with long food names, at 320, 360, 390 and 1280 pixels wide. The figures card is 272 pixels tall on a phone, 292 at 320 where the recipe's line takes two lines, and 268 at 1280. **Put back** is 68 by 44 pixels in a row of 67 on a phone and 57 from `md`. Nothing scrolls sideways with a recipe of 25 lines, or with a name long enough to be cut at two lines. With a keyboard of 260 pixels at 320 by 568 and 390 by 844, the focused field is in view and **Log as made** ends 16 pixels above the keyboard.

### Data and refresh

The sheet sends `POST /cooks` once, through `logCook` of `useEntryActions`, with the batch's id made as the sheet opens and kept across a second press, so a press after a lost answer stores nothing twice. The server answers such a press with the batch it holds, and `sameBatch` in `cookDraft.ts` compares that with what the press sent: its day, its servings, each line and each serving. An id that another account holds is made anew for the next press: the batch's, the lines' or the new servings'. The figures on screen come from `recipeBasis` and `entryFigures` in `packages/types`, the functions the server runs on the same lines, and the marks from `cookDiff`, the function the server answers with. The answer's days go into the cache as every entry write's do, so both readings of each day show at once, and the recent items, the recipes and the log sheet's lists are read again. After a press with no answer, each day a serving is on is read again.

The other planned servings are read from the days themselves, seven of them from **Made on**, each from the cache when it is there. The list shows once every one of them has answered. While a new set of days is read the list is the last one that had (`useOtherServings`).

### Known gaps

- A logged batch is changed by an assistant only. The screen has no way to edit one.
- **Made on** takes any date. A batch dated after today holds planned servings on that day and later, and a row dated today or earlier can still be eaten.
- A row's date can be earlier than **Made on**.
- The serving the sheet opened from shows its servings as text. They change in the entry's own sheet.
- A line that becomes changed grows its row by 20 pixels.

## Features on this page

- [Recipes](../features/recipes.md#logging-as-made): a batch logged as made, its figures, what it attaches and adds, and when it differs from its recipe.
- [Days](../features/days.md): the entries the batch's servings are, eaten or planned, and the figures they keep.
- [Quick logging](../features/quick-logging.md): the rule that a day after today holds planned entries only.
