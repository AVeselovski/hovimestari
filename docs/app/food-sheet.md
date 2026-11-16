# The food sheet

The one place to find a food, read its figures and keep the foods of your own. It opens from **Search foods** at the top of the Day tab and covers nearly the whole screen. It has two views: the search, and a food's detail. Adding or changing a food or a portion opens a smaller sheet on top of it.

## In detail

### The search

The search field sits at the top of the sheet, with the search icon in it and no label on screen. Once something is typed, a cross at its end clears it. Enter puts the keyboard away. The field never moves, whatever the list under it does.

With nothing typed, or one character, the sheet shows two lists. **Favourites** holds the foods marked as favourite, newest first, or "Foods you mark as favourite appear here.". **Your foods** holds the foods you added, or "Foods you add appear here.". Under both sits **Add your own food**. When neither list can be read, one line says "Your favourites and your foods show here once Hovimestari can reach the server.".

From two characters the sheet shows what matches, in [the search's order](../features/foods.md#searching-for-a-food), at most 30 foods. The results follow the typing once it pauses. Until the first results are in, the two lists stay, and they return as soon as the text drops under two characters, so the sheet is never blank in between. While the next results load, the last ones stay on screen. Each row shows:

- the food's name in the [food-name language](../features/foods.md#food-name-language), wrapping when it is long and hyphenated by the rules of its language,
- the name in the other language under it, in muted text, when it differs,
- "131 kcal · 7.0 g protein per 100 g" in the monospaced face, the protein with one decimal always,
- a star at the end of a favourite, and "Yours" on a food you added. The star's place is kept on every row, so marking a food never rewraps its name or moves the rows below.

A query nothing matches says "No food matches “Mummon pulla”." and offers **Add “Mummon pulla” as your own food**, which opens the own-food sheet with that name filled in. Both name the text the results are for, also while the next text is still being typed. Offline the sheet says "Search needs a connection.". A search that fails says "Search did not work." with **Try again**.

### A food's detail

Tapping a row opens its detail in the same sheet. **Back** is at the top left and the favourite star at the top right. Under them the food's name opens the body in the display face, hyphenated by the rules of its language, and scrolls with it, so a long name never crowds out the rest. Below it:

- the name in the other language,
- where the figures come from: "From Fineli" with a link **About the food data** to the credit in [Settings](settings.md#food-data), "Your own food" or "From Open Food Facts",
- for a food Fineli no longer lists, "This food is no longer in Fineli. Its figures are from an earlier release.",
- **Per 100 g**: energy, protein, carbohydrates and fat, one row each, marked by a dot in [the macro's hue](colors.md#the-macro-hues), the figure in ink at the right. Energy is in whole kcal and grams have one decimal always, so the decimals line up,
- **Portions**: each [portion](../features/foods.md#portions) with its weight, to at most one decimal as it was typed, "No portions yet." when there is none, and **Add a portion**. A portion you added has a pencil and opens for editing. Fineli's portions read "Medium piece", "Decilitre" and so on, and cannot be changed,
- for a food you added, **Edit food** and **Delete food**. **Edit food** shows once the detail has loaded, since the form opens on what was saved.

Until the detail has loaded, it shows the name and figures of the row it was opened from. When it cannot be read, offline or after an error, the portions say "Portions show here once Hovimestari can reach the server.". Following **About the food data** closes the sheet on its way to Settings.

The star marks the food as a [favourite](../features/foods.md#favourites) at once, and the favourites list follows. A row that shows the food gets its star in the same place, and no list changes its order, so the list under the thumb never moves. When the mark fails, also without a network, the star goes back to what the server holds and a line at the top of the body says why.

**Back** returns to the search as it was: the same text, the same results, scrolled to the same place, with focus on the row that was opened. A food that is gone, deleted on another device, sends the sheet back to the search with "This food is no longer available.", with focus in the search field. That happens as the detail opens, when the star finds it gone, or when a save or a delete in a sheet on top of it finds it gone, and that sheet closes too.

**Delete food** asks first: "Delete Mummon pulla?" with "This removes the food and its portions." and **Delete**. Afterwards the sheet shows the two lists, with focus in the search field. A food already deleted on another device counts as deleted.

### Adding or editing your own food

The own-food sheet is titled "Add a food" or "Edit food". It asks for **Name**, then under **Per 100 g** and "Copy the values from the label." the four values **Energy** (kcal), **Protein**, **Carbohydrates** and **Fat** (g), each on one row with its label on the left and the field on the right, then **Barcode (optional)**. A new food's fields open empty, apart from a name the search typed. An edit opens with what was saved. **Save food** reads "Saving…" while it works. Each field shows what is wrong in a line under it, such as "Enter a value from the label." or "One of your foods already has this barcode.". A number that [may hold a thousands group](../features/foods.md#your-own-foods), such as "1,500", says "This may mean thousands. Type it with no comma or point, or with fewer decimals.". An edit also offers **Delete**, which asks as above, from the own-food sheet or the detail alike.

A saved new food opens in the detail. A saved edit updates it. The lists and every earlier search show the change as soon as they are back on screen, with one limit: after a new food or a changed name, a search for other text is read again, and the two lists show in its place until it answers.

### Portions of your own

The portion sheet is titled "Add a portion" or "Edit portion", with **Name** and **Weight** (g), and **Save**. An edit also offers **Delete**, which asks "Delete this portion?" with "This removes “Purkki” from the food's portions.". A saved or deleted portion shows in the detail as the sheet closes. After a delete, focus is on **Add a portion**.

### On a phone

The sheet slides up from the bottom and stops 3rem below the top, so the Day tab still shows above it. A finger on the handle drags it down to close it, and so does a tap above it. No field takes focus as it opens, so no keyboard rises while it slides. The own-food and portion sheets slide up on top of it, and the food sheet shrinks a little behind them, its handle fading so only the top sheet's shows. Every row is at least 56 pixels tall and the star is a 44 pixel target.

## How it works

### Route and entry

The sheet is `FoodSheet` in `apps/web/src/components/foods/`, opened by `FoodSearchLauncher` on the Day tab at `/`. The launcher keeps it mounted while it slides out and gives it a fresh mount on every open. Its parts sit beside it: `FoodSearchView` for the search, `FoodRow` for a row, `FoodDetail` for the detail's header and body, `Per100gFigures`, `FavouriteButton`, `FoodSourceLine`, and the stacked `OwnFoodSheet` and `PortionSheet`.

### Layout

The sheet is a [`BottomSheet`](shell.md#the-sheet-primitives) with `size="tall"`: one fixed height, `100dvh` less the top inset and 3rem on a phone, and `min(44rem, 85dvh)` as the centred `md:max-w-lg` panel from `md`. Its height never follows its content, so its top edge is the same in every view and state, also with a keyboard up, and the search field in its fixed header never moves. Only the body under the header scrolls. In the detail the header holds Back and the star instead, and the dialog keeps the food's name as its own. The sheet is dismissible in every state, since it holds no form.

Focus follows [the sheet conventions](shell.md#the-sheet-primitives). On a phone the body takes focus as the sheet opens. From `md` the search field does. Opening a detail puts focus on **Back**. Back puts it on the row that was opened, or in the field when that row is gone.

`OwnFoodSheet` is a tall [`FormSheet`](shell.md#the-sheet-primitives) too, so its top and Save hold still whatever lines appear under its fields. Every field in it keeps two lines of room, the longest line it can show at 320 pixels, so an error moves no field below it. Its four values are `DecimalField`s with `layout="beside"`. `PortionSheet` sizes to its content and keeps two lines of room under each field, so an error that wraps moves nothing. Their numbers are `DecimalField`s read with `parseDecimalInput`, at the decimals [the catalogue holds](../features/foods.md#your-own-foods): two for energy, three for a macro and one for a weight. A saved figure left as it opened in an edit is sent as saved, unread, and a name left as saved is sent unchecked, as [the server checks only a changed one](../features/foods.md#your-own-foods).

### Data and refresh

Every read is keyed under `["foods"]`. A write puts its own answer into the cached reads first, through `apps/web/src/lib/foodCache.ts`, then reads again. A list not on screen comes back with the write in it at once, before its read lands, with one limit: after a new food or a new name, a search whose text is not exactly that name is read afresh, and while that read is out the two lists show in its place. The function for each write is in `apps/web/src/lib/invalidation.ts`.

- The two lists read `GET /foods/favourites` and `GET /foods/own`.
- A search waits for 150 ms of no typing, then reads `GET /foods/search?q=` with the text trimmed and in lower case, so "Rahka" and "rahka" share one answer. A newer query aborts the read it replaces. Nothing is sent for fewer than two characters. Results stay fresh for 30 seconds, so Back shows them from the cache with no request.
- A detail reads `GET /foods/:id`, showing the row's own figures until it answers.
- The star sends `PUT` or `DELETE /foods/:id/favourite`, and fails at once without a network. The detail, the food's row in every cached list and the favourites change at once, in place. Marks of one food run one after another, and only the last one rolls back or reads again. A failure puts back that food alone, to what the server last confirmed for it, and marks the searches and your foods stale, so each reads again the next time it shows. After the last mark, the detail and the favourites are read again. The searches and your foods are not, so their order holds until the query changes.
- A saved edit puts the answer into the detail and into the food's row in every list, then reads every food again.
- A new food goes into your foods at its place in their order, by name in Finnish order, as the server sorts them. A new food, or an edit that changes the name, goes into a search that found nothing for exactly its name. Every other cached search is dropped when not on screen and read afresh when on it, so none comes back with the food where it no longer matches, or without it where it now does.
- A delete, or a food found gone, takes the food's row out of every list and drops its detail.
- A saved portion goes into the food's detail at its place, Fineli's measures first and then yours by name, replacing it on an edit. A deleted one, or one found gone, leaves the detail. Then the detail is read again.
- A change of food-name language drops every food read not on screen, so nothing shows in the old language.

The screen shows the figures the API answers and computes none. It rounds them for display only, never groups digits and always uses Latin digits, so what shows can be typed back. Errors show by their code from the catalog.

### Known gaps

- The sheet has been checked in Chromium only. A real iPhone has not shown the keyboard over it yet.

## Features on this page

- [Foods](../features/foods.md): the catalogue, the search and its order, own foods, portions, favourites and the food-name language.
