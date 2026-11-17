# The log sheet

The one place to log a food, a saved meal or an estimate to a day, find a food, read its figures, and keep the foods and saved meals of your own. It opens from **Log food** at the top of the Day tab, or **Add to plan** on a future day, and covers nearly the whole screen. It logs to the day it opened on. It has four views: the search, a food, a saved meal and the archived meals. Adding or changing a food, a portion or a saved meal, and adding an estimate, opens a sheet on top of it.

## In detail

### The status line

The first line of the sheet, in every view, names the day it logs to: "Logging to today", "Logging to yesterday", "Planning for tomorrow", or "Logging to Tue 17 Nov" and "Planning for Thu 19 Nov" for other days. A sheet left open past midnight keeps logging to the day it opened on, and its line turns from "Logging to today" into "Logging to yesterday".

When a "+", an archive or a restore could not go through, the same line says why, in the accent: "Could not confirm. Try again." when the request may have landed, "You are offline." when nothing was sent, or the reason the server gave. After a meal saved without logging, or an edit saved, it says so in ink, such as "Saved Chicken bowl.". The line holds one message at a time, the latest. It goes back to the day after six seconds, or at the next tap or key press.

### The search

The search field sits under the status line, with the search icon in it and "Search foods and meals" in it until something is typed. Once something is typed, a cross at its end clears it. Enter puts the keyboard away. The field never moves, whatever the list under it does.

With nothing typed, or one character, the sheet starts with two buttons side by side, **New saved meal** and **Add an estimate**, then shows four lists:

- **Recent**: the foods and saved meals eaten most recently, newest first, up to 12, from [recent items](../features/quick-logging.md#recent-items-and-the-last-amount). Each row shows "Last 250 g", "Last 2 × Medium piece · 110 g" or "Last 1 meal", and a saved meal its source. "Foods and meals you log appear here." when there is none.
- **Favourites**: the foods marked as favourite, newest first, or "Foods you mark as favourite appear here.". A favourite eaten before shows its last amount the same way.
- **Saved meals**: your [saved meals](../features/saved-meals.md#a-saved-meal) by name, each with its source and "640 kcal · 42.0 g protein per meal", or "Meals you save appear here.". When they name two sources or more, chips over the list read **All** and each source, one row that scrolls sideways, the chosen one in the accent. A chip [keeps that source's meals alone](../features/saved-meals.md#finding-a-meal-by-its-source), in the search results too. **Archived meals** always sits under the list.
- **Your foods**: the foods you added, or "Foods you add appear here.".

While the sheet is open, the four lists keep their order and their rows, so a row never moves under the finger. On the first open, the lists show their rows together, once every list has answered or cannot be read. Until then each shows its heading alone. A row changes in place: its star, its "Last" line, the ring in its **+**. What changed elsewhere shows at the next open. [Data and refresh](#data-and-refresh) says when each list reads.

Under them sits **Add your own food**. When the favourites and your foods cannot be read, one line says "Your favourites and your foods show here once Hovimestari can reach the server.". When the recent items cannot be read, their line says "Your recent items and saved meals show here once Hovimestari can reach the server.", and the saved meals say the same when only they cannot be read.

From two characters the sheet shows what matches, in [the search's order](../features/foods.md#searching-for-a-food), at most 30 foods. The results follow the typing once it pauses. Until the first results are in, the lists stay, and they return as soon as the text drops under two characters, so the sheet is never blank in between. While the next results load, the last ones stay on screen. When the results take the lists' place, and whenever the text changes, the sheet scrolls to its top, so the best matches are in view. Each row shows:

- the food's name in the [food-name language](../features/foods.md#food-name-language), wrapping when it is long and hyphenated by the rules of its language,
- the name in the other language under it, in muted text, when it differs,
- "131 kcal · 7.0 g protein per 100 g" in the monospaced face, the protein with one decimal always,
- a star at the end of a favourite, and "Yours" on a food you added. The star's place is kept on every row, so marking a food never rewraps its name or moves the rows below.

Above the foods come the saved meals that match the text, under **Saved meals**, from the chosen source alone when a chip is chosen. They follow every key, since they are found on the device. The foods under them then have a heading of their own, **Foods**. When no meal matches, two buttons take their place, such as **Save “Pizza night” as a meal** and **Add “Pizza night” as an estimate**, each opening its sheet with the name filled in.

A query no food matches says "No food matches “Mummon pulla”." and offers **Add “Mummon pulla” as your own food**, which opens the own-food sheet with that name filled in. Both name the text the results are for, also while the next text is still being typed. Offline the sheet says "Search needs a connection." under the meals that match. A search that fails says "Search did not work." with **Try again**.

### Logging again in one press

A recent item, a saved meal, and a favourite with a last amount, has a round **+** at the end of its row. A saved meal's **+** logs its last count, or one meal when it was never eaten. One press logs it again with [its last amount](../features/quick-logging.md#logging-again): eaten on today and past days, planned on a future day. So an item eaten before takes two presses from the Day tab, **Log food** and **+**. Its name for a screen reader says what it adds, such as "Log Rahka again, 250 g" or "Plan Rahka, 250 g".

While it logs, a ring turns in the pressed **+** and every **+** waits. The sheet then closes as the answer arrives, and the line above the tab bar says "Logged Rahka, 250 g." or "Added Rahka to the plan." with **Undo**. After "Could not confirm. Try again." the app reads the day again, so an entry that landed shows on the Day tab. Pressing **+** again then sends [the same request](../features/quick-logging.md#writes-from-the-web-app), so the item is logged once. A [request the server already had](../features/quick-logging.md#a-request-sent-twice) says "Already logged Rahka." or "Rahka is already in the plan." with **Log another** or **Plan another**, which logs it once more. One removed since says "This was removed. Log another?" with **Log another**.

### A food

Tapping a food's row opens it in the same sheet. The top row holds **Back**, the food's name on one line and the favourite star. The body starts with the log block:

1. Chips for the unit: "g", then each portion with its weight, such as "Medium piece · 125 g". The chosen chip is in the accent. The row scrolls sideways on a phone.
2. **Amount**, the grams or the count of the chosen portion, filled in with the last amount. A food never logged opens empty, with "Enter an amount to see its figures.".
3. "For this amount" and the calories, protein, carbs and fat it comes to, side by side.
4. **Eaten or planned**: Eaten on today and past days, Planned and fixed on a future day with "Future days hold planned entries.".

**Log** sits in the footer, or **Add to plan** while Planned is chosen. It waits while nothing is typed. It logs the amount, closes the sheet and shows the same line as **+**. A log that fails keeps the view and what was typed, and says why above the button: "You are offline. Changes need a connection." or "Could not confirm. Check your connection and try again.". **Log** then sends the same request again. A portion removed since says "This portion is no longer available." and the amount turns to grams.

Under the log block, the food's detail:

- its name in the display face, and the name in the other language,
- where the figures come from: "From Fineli" with a link **About the food data** to the credit in [Settings](settings.md#food-data), "Your own food" or "From Open Food Facts",
- for a food Fineli no longer lists, "This food is no longer in Fineli. Its figures are from an earlier release.",
- **Per 100 g**: energy, protein, carbohydrates and fat, one row each, marked by a dot in [the macro's hue](colors.md#the-macro-hues), the figure in ink at the right. Energy is in whole kcal and grams have one decimal always, so the decimals line up,
- **Portions**: each [portion](../features/foods.md#portions) with its weight, to at most one decimal as it was typed, "No portions yet." when there is none, and **Add a portion**. A portion you added has a pencil and opens for editing. Fineli's portions read "Medium piece", "Decilitre" and so on, and cannot be changed,
- for a food you added, **Edit food** and **Delete food**. **Edit food** shows once the detail has loaded, since the form opens on what was saved.

Until the detail has loaded, it shows the name and figures of the row it was opened from, and the chips "g" and the last amount's portion. A food opened from the search results or your foods takes its last amount from the detail when it arrives, while nothing has been typed. When the detail cannot be read, offline or after an error, the portions say "Portions show here once Hovimestari can reach the server.". Following **About the food data** closes the sheet on its way to Settings.

The star marks the food as a [favourite](../features/foods.md#favourites) at once, and the lists follow. A row that shows the food, a recent item included, gets its star in the same place, and no list changes its order, so the list under the thumb never moves. When the mark fails, also without a network, the star goes back to what the server holds and a line at the top of the body says why.

**Back** returns to the search as it was: the same text, the same results, scrolled to the same place, with focus on the row that was opened. A food that is gone, deleted on another device, sends the sheet back to the search with "This food is no longer available.", with focus in the search field. That happens as the food opens, when the star or a log finds it gone, or when a save or a delete in a sheet on top of it finds it gone, and that sheet closes too.

**Delete food** asks first: "Delete Mummon pulla?" with "This removes the food and its portions." and **Delete**. Afterwards the sheet shows the lists, with focus in the search field. A food already deleted on another device counts as deleted.

### A saved meal

Tapping a saved meal opens it. The top row holds **Back** and the meal's name. The log block asks for **Meals**, filled in with the last count, else 1, and shows the figures for that many meals and **Eaten or planned**. Under it come the meal's name, "From Wolt" when it has a source, and **Per meal** with its four figures. **Log** in the footer logs it as a food's does. An archived meal can be logged too.

Under the figures:

- **Edit meal** opens the saved meal sheet on the meal's own values. A saved edit changes the meal here and its row in every list, in place.
- **Archive meal** moves it to the archived meals at once, and the button turns into **Restore meal**, which brings it back. Each is the other's undo. Focus stays on the button and the view does not scroll, so the two can be pressed in turn.
- **Delete meal** asks first: "Delete Chicken bowl?" with "Days it was logged on keep their figures." and **Delete**. Afterwards the sheet shows the lists, with focus in the search field.

A meal that is gone, deleted on another device, sends the sheet back to the search with "This saved meal is no longer available.", also when a log, an edit or an archive finds it gone.

### Archived meals

**Archived meals** opens the list of archived meals, with **Back** and "Archived meals" in the top row. The list is read when it opens. Each row opens its meal and carries **Restore** at its end, which takes it off this list and back to the saved meals. "Meals you archive appear here." when there is none.

### A new saved meal

The saved meal sheet is titled "New saved meal", or "Edit saved meal" for an edit. It asks for:

1. **Eaten or planned**, on a new meal only, as in the log block.
2. **Name**. Enter moves on to Calories.
3. **From (optional)**, empty as it opens. Your sources sit under it as chips: a chip fills the field, and the chip that matches it is in the accent. On a phone the chips are one row that scrolls sideways. From `md` they wrap, so a mouse reaches every one. A source too long for the row is cut short with an ellipsis, there and in the chips over the saved meals. Hovering a chip shows its whole name. With no sources yet, the line under it says "Where the meal comes from, such as a delivery service.".
4. **Per meal**: **Calories** and **Protein** over **Carbohydrates** and **Fat**, each with its unit. The line under them says "Copy the figures from the label or the menu.", and the first refused figure's reason when one is refused.

On a phone they come one under the other, in that order. From `md` a new meal's Eaten or planned sits beside the name, as tall as the name field, with From and its chips across the width under them. An edit has no choice, so its Name and From each take the width, one under the other.

A new meal's **Save and log**, or **Save and add to plan** while Planned is chosen, saves the meal and logs one of it in one request. Both sheets then close together and the line above the tab bar says "Saved Chicken bowl and logged 1 meal." or "Saved Chicken bowl and added it to the plan." with **Remove from day** or **Remove from plan**, which takes the entry off and leaves the meal saved. **Save meal**, on its own row over the buttons on a phone and at the start of their row from `md`, saves the meal without logging it: the sheet closes, the log sheet stays on its lists with the meal in them, and its status line says "Saved Chicken bowl.". A save that could not confirm keeps what was typed. Pressing again makes one meal and logs it at most once, with what is on screen, by [the rule for a save that could not confirm](../features/saved-meals.md#a-save-that-could-not-confirm). An edit's button reads **Save meal**, and a saved edit says "Saved Chicken bowl." on the status line too.

From the Day tab a new delivered meal takes seven taps and five typed values: **Log food**, **New saved meal**, the name, then Protein, Carbohydrates and Fat, and **Save and log**. Calories follows the name by Enter.

### An estimate

**Add an estimate** opens a sheet titled "Add an estimate" with "For a meal you cannot weigh, such as a restaurant dinner.". It asks for **Eaten or planned** first, then the name, the four figures two by two, and **Note (optional)**. From `md` Eaten or planned sits beside the name. **Save estimate** logs it to the sheet's day, both sheets close together, and the line above the tab bar says "Logged Restaurant dinner." with **Undo**. The day marks it as an [estimate](../features/days.md#estimates).

### Adding or editing your own food

The own-food sheet is titled "Add a food" or "Edit food". It asks for **Name**, then under **Per 100 g** and "Copy the values from the label." the four values **Energy** (kcal), **Protein**, **Carbohydrates** and **Fat** (g), each on one row with its label on the left and the field on the right, then **Barcode (optional)**. A new food's fields open empty, apart from a name the search typed. An edit opens with what was saved. **Save food** reads "Saving…" while it works. Each field shows what is wrong in a line under it, such as "Enter a value from the label." or "One of your foods already has this barcode.". A number that [may hold a thousands group](../features/foods.md#your-own-foods), such as "1,500", says "This may mean thousands. Type it with no comma or point, or with fewer decimals.". An edit also offers **Delete**, which asks as above, from the own-food sheet or the food alike.

A saved new food opens in its food view. A saved edit updates it. The lists and every earlier search show the change as soon as they are back on screen, with one limit: after a new food or a changed name, a search for other text is read again, and the lists show in its place until it answers.

### Portions of your own

The portion sheet is titled "Add a portion" or "Edit portion", with **Name** and **Weight** (g), and **Save**. An edit also offers **Delete**, which asks "Delete this portion?" with "This removes “Purkki” from the food's portions.". A saved or deleted portion shows in the food view as the sheet closes. After a delete, focus is on **Add a portion**.

### On a phone

The sheet slides up from the bottom and stops 3rem below the top, so the Day tab still shows above it. A finger on the handle drags it down to close it, and so does a tap above it. A food or meal view with a changed amount, or a log on its way, refuses the swipe and springs back, and **Back** still leaves it. No field takes focus as it opens, so no keyboard rises while it slides. A **+**, **New saved meal** and **Add an estimate** ignore a press until the sheet has finished sliding in, so the second tap of a double tap on **Log food** does nothing. While the sheet slides away after a log it [catches every tap](shell.md#sheets-and-dialogs), so the second tap of a double tap on **+**, **Log**, **Save and log** or **Save estimate** reaches nothing under it. From `md` a mouse double click on them reaches nothing under the dialog either. **Log** rides above the keyboard with the footer, and the amount field stays in view. The own-food, portion, saved meal and estimate sheets slide up on top of it, and the log sheet shrinks a little behind them, its handle fading so only the top sheet's shows. Every row is at least 56 pixels tall, and the star and every **+** are 44 pixel targets.

## How it works

### Route and entry

The sheet is `FoodSheet` in `apps/web/src/components/foods/`, opened by `DayLauncher` in `apps/web/src/components/day/` with the day shown. The launcher keeps it mounted while it slides out and gives it a fresh mount on every open. It waits while the app [asks the server for today](day.md#across-midnight). The search view's parts sit beside it: `FoodSearchView`, `FoodRow`, `SearchField`, `FoodDetail` for a food's header and detail, `FavouriteButton` and `FoodSourceLine`. `useSheetNavigation` holds the views as a stack, each with its scroll position and the row that opened the next. `FoodSheetStack` renders the stacked `OwnFoodSheet`, `PortionSheet`, `SavedMealSheet` and `EstimateSheet` and the delete confirmations.

The logging parts are in `apps/web/src/components/log/`: `StatusLine`, `CreateActions`, `RecentList`, `SavedMealList` with `SourceChips` and `mealFilter`, `SavedMealRow`, `LogAgainButton` and `useLogAgain` for **+**, `LogBlock`, `LogFooter` and `useLogForm` for a food's or a meal's log, `MealView`, `ArchivedMealsView` and `useMealActions` for archiving and restoring, and the two form sheets `SavedMealSheet` and `EstimateSheet` with `mealForm`.

### Layout

The sheet is a [`BottomSheet`](shell.md#the-sheet-primitives) with `size="tall"`: one fixed height, `100dvh` less the top inset and 3rem on a phone, and `min(48rem, 100dvh - 2rem)` as the centred `md:max-w-lg` panel from `md`. Its height never follows its content, so its top edge is the same in every view and state, with and without the footer, also with a keyboard up. The status line is one line whose room is always kept, so the search field and **Back** under it never move. Measured on a production build at 375 by 667 and 390 by 844, the top edge and the status line hold to the pixel across the search, the results, a food, a meal, a failure on the status line and an emulated keyboard.

The log block fits the first screen of a phone with the keyboard closed: the amount's label sits beside its field, and the four figures share one row. The field is 11rem wide, so "1234,5" beside "portions" and "99,75" beside "meals" show in full, and it keeps that width in grams too, so choosing a chip never moves it. At 375 by 667 the block ends 5 pixels above the footer. Every line in it keeps its room: two lines under the amount for its error, one for "For this amount", one under Eaten or planned. The refusal line no field owns sits in the footer above **Log** and keeps two lines of room, given to the body while the keyboard is open, as every [form sheet's](shell.md#the-sheet-primitives) does.

Focus follows [the sheet conventions](shell.md#the-sheet-primitives). On a phone the body takes focus as the sheet opens. From `md` the search field does. Opening a food or a meal puts focus on **Back**. Back puts it on the row that was opened, in the list it was opened from, or in the field when that row is gone, and back from the archived meals on **Archived meals**. A log, "Save and log" and "Save estimate" return focus to the launcher. A sheet on top of the log sheet that closes alone returns focus to the button that opened it.

`SavedMealSheet` and `EstimateSheet` are tall [`FormSheet`s](shell.md#the-sheet-primitives) with the `md:max-w-lg` dialog, as wide as the log sheet under them. Their four figures are `FigureFields` from `apps/web/src/components/entries/`, two by two at every width, so each field shows a value such as 1234,5 in full. The line under them keeps two lines of room for the longest refusal on a phone and one from `md`. From `md` two fields share a row (`pairRow`), and **Save meal** shares the buttons' row. On a phone each footer keeps the refusal line's two lines of room, and the saved meal sheet's also holds **Save meal** on a row of its own.

Measured on a production build:

- At 390 by 844 the estimate sheet shows Eaten or planned, the name and the four figures above the footer, and its note follows on a short scroll. The new saved meal sheet shows Eaten or planned, the name, From with its chips, and Calories and Protein. Carbohydrates and Fat follow on a short scroll.
- At 375 by 667 and 320 by 568 both show the choice and the name, and scroll for the rest.
- At 768 by 1024, 1280 by 800, 1366 by 768 and 1440 by 900 the estimate dialog shows its whole form with no scroll. The saved meal dialogs' fit depends on how many rows the source chips take: with one row both show their whole form, and with two, from five short sources or one long name, both scroll by 1 pixel, and by 33 at 1366 by 768. Each further row adds about 52 pixels. Five sources with one long name take three rows: the dialogs scroll by 53 pixels, and by 85 at 1366 by 768, where part of the last row of figures is out of view until you scroll. Neither scrolls sideways, whatever the sources' names.

`OwnFoodSheet` is a tall [`FormSheet`](shell.md#the-sheet-primitives) too, so its top and Save hold still whatever lines appear under its fields. Every field in it keeps two lines of room, the longest line it can show at 320 pixels, so an error moves no field below it. Its four values are `DecimalField`s with `layout="beside"`. `PortionSheet` sizes to its content and keeps two lines of room under each field, so an error that wraps moves nothing. Their numbers are `DecimalField`s read with `parseDecimalInput`, at the decimals [the catalogue holds](../features/foods.md#your-own-foods): two for energy, three for a macro and one for a weight. A saved figure left as it opened in an edit is sent as saved, unread, and a name left as saved is sent unchecked, as [the server checks only a changed one](../features/foods.md#your-own-foods).

### Logging

Every add goes through `useEntryActions` on the Day tab, as [writes from the web app](../features/quick-logging.md#writes-from-the-web-app) say: it carries an id the app chose, and its answer puts the day into the cache, so no day is read again for it. An add that could not confirm reads its day again. The figures a food or a meal shows for an amount are `entryFigures` on the food's per-100 g values or the meal's figures, the function the server runs, so they are the figures **Log** stores.

A log closes the sheet as its answer arrives, with the pressed **+** or **Log** busy while it slides out. A closing sheet catches every tap until it has gone, by `closingSheet.ts` under [the sheet primitives](shell.md#the-sheet-primitives), so the second tap of a double tap reaches nothing under it. The add's line shows once the sheet has slid out. "Save and log" and "Save estimate" close their own sheet and the log sheet in the same update, so the two slide out together and focus lands on **Log food**.

### Data and refresh

Every food read is keyed under `["foods"]`, the recent items under `["log", "recents"]` and the saved meals under `["savedMeals", "list", archived]`. The Day tab reads the recent items, the favourites, the active saved meals and your foods once its day is on screen, so the sheet opens with them. The archived meals are read only when their view opens. A write puts its own answer into the cached reads first, through `apps/web/src/lib/foodCache.ts`, then reads again. A list not on screen comes back with the write in it at once, before its read lands, with one limit: after a new food or a new name, a search whose text is not exactly that name is read afresh, and while that read is out the lists show in its place. The function for each write is in `apps/web/src/lib/invalidation.ts`.

- The lists read `GET /log/recents`, `GET /foods/favourites` and `GET /foods/own`. The recent items are read again when the page is shown or the connection returns.
- An open list never reorders under the finger (`apps/web/src/components/log/heldList.tsx`). Recent, Favourites, Saved meals and Your foods each hold the order and the rows they showed while they can be pressed. A read that lands later, from the page shown again, the connection back, a mount or an add that could not confirm, changes a row's own data in place and moves no row. A list with no rows yet waits for the others: no list shows a row until every list has its first answer, from the cache or the server, or cannot be read, and then all of them show in one render. A press that started before those rows were painted reaches nothing. Rows that came after a wait take presses half a second after they are painted, as a sheet that slides in does, so a finger aimed a moment before lands on nothing. Rows that are there at once take presses at once. The create actions and the search field work all the while. A list follows what is read only while it cannot be pressed: as the sheet slides in on a phone, and while a sheet stacked on it is open. It starts again from what is cached when it shows again, back from a food or a meal, so a write made there is in it. A meal saved from the stacked sheet takes its place by name as that sheet closes, and a favourite mark the server refused takes its row back out. A food or a saved meal a press finds gone leaves every list at once. Once the sheet has closed, every list a write left stale is read (`prefetchLogLists`), so the next open shows it.
- A search waits for 150 ms of no typing, then reads `GET /foods/search?q=` with the text trimmed and in lower case, so "Rahka" and "rahka" share one answer. A newer query aborts the read it replaces. Nothing is sent for fewer than two characters. Results stay fresh for 30 seconds, so Back shows them from the cache with no request.
- A food reads `GET /foods/:id`, showing the row's own figures until it answers.
- A log sends `POST /entries`, an estimate included, as [an add](../features/quick-logging.md#writes-from-the-web-app). After it, the recent items, the saved meals, the favourites and the food details are read again, for their last amounts. After an add that could not confirm, its day and the ranges are read again at once, and the recent items, with the saved meals after a **Save and log**, are only marked stale until the sheet closes.
- The saved meals read `GET /saved-meals` once for browsing and every search, which filter them on the device.
- **Save and log**, **Save meal**, an edit, archive, restore and delete send the saved meal routes. What each sends and puts in the cache is in [saved meal writes from the web app](../features/saved-meals.md#writes-from-the-web-app).
- The star sends `PUT` or `DELETE /foods/:id/favourite`, and fails at once without a network. The food, its row in every cached list, the recent items and the favourites change at once, in place. Marks of one food run one after another, and only the last one rolls back or reads again. A failure puts back that food alone, to what the server last confirmed for it, and marks the searches, your foods and the recent items stale, so each reads again the next time it shows. A mark settles in the same way after the sheet has closed. After the last mark, the food and the favourites are read again. The other lists are not, so their order holds until the query changes.
- A saved edit puts the answer into the food and into its row in every list, then reads every food again.
- A new food goes into your foods at its place in their order, by name in Finnish order, as the server sorts them. A new food, or an edit that changes the name, goes into a search that found nothing for exactly its name. Every other cached search is dropped when not on screen and read afresh when on it, so none comes back with the food where it no longer matches, or without it where it now does.
- A delete, or a food found gone, takes the food's row out of every list, the recent items included, and drops its detail.
- A saved portion goes into the food's detail at its place, Fineli's measures first and then yours by name, replacing it on an edit. A deleted one, or one found gone, leaves the detail. Then the detail is read again.
- A change of food-name language drops every food read not on screen, so nothing shows in the old language.

The screen shows the figures the API answers and computes none but a log's figures, through the shared function. It rounds them for display only, never groups digits and always uses Latin digits, so what shows can be typed back. Errors show by their code from the catalog.

### Known gaps

- The sheet has been checked in Chromium only. A real iPhone has not shown the keyboard over it yet.
- At 320 by 568 with the keyboard open, a refusal in the saved meal sheet's footer leaves Save level with the keyboard's top edge, with little of the form in view.
- From `md` each row of source chips after the first makes the saved meal dialogs scroll, by about 52 pixels a row. Three rows scroll them by 85 pixels at 1366 by 768.
- On a phone a press on the log sheet is dropped while a sheet on top of it slides away, for about 420 milliseconds.

## Features on this page

- [Quick logging](../features/quick-logging.md): logging a food, a saved meal or an estimate, logging again with its last amount, the recent items, replays and undo.
- [Foods](../features/foods.md): the catalogue, the search and its order, own foods, portions, favourites and the food-name language.
- [Saved meals](../features/saved-meals.md): saving a meal, alone or with its first log, editing, archiving, restoring and deleting it, and the source filter.
- [Days](../features/days.md): the estimates the estimate sheet adds.
