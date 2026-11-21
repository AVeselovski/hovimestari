# The log sheet

The one place to log a food, a saved meal or an estimate to a day, find a food, read its figures, and keep the foods and saved meals of your own. It opens from **Log food** at the top of the Day tab, or **Add to plan** on a future day, and covers nearly the whole screen. It logs to the day it opened on. It has four views: the search, a food, a saved meal and the archived meals. Adding or changing a food, a portion or a saved meal, and adding an estimate, opens a sheet on top of it. [The Recipes tab](recipes.md) keeps the same saved meals and own foods, from the same lists, so a change in either place shows in the other.

## In detail

### The status line

The first line of the sheet, in every view, names the day it logs to: "Logging to today", "Logging to yesterday", "Planning for tomorrow", or "Logging to Tue 17 Nov" and "Planning for Thu 19 Nov" for other days. A sheet left open past midnight keeps logging to the day it opened on, and its line turns from "Logging to today" into "Logging to yesterday".

When a "+", an archive or a restore could not go through, the same line says why, in the accent: "Could not confirm. Try again." when the request may have landed, "You are offline." when nothing was sent, or the reason the server gave. After a meal saved without logging, or an edit saved, it says so in ink, such as "Saved Chicken bowl.". The line holds one message at a time, the latest. It goes back to the day after six seconds, or at the next tap or key press.

### The search

The search field sits under the status line, with the search icon in it and "Search foods and meals" in it until something is typed. While it is empty, a camera button at its end [scans a barcode](#scanning-a-barcode), where the browser can use a camera. Once something is typed, a cross in the same place clears it. Enter puts the keyboard away, and looks up [a typed barcode](#a-typed-barcode). The field never moves, whatever the list under it does.

With nothing typed, or one character, the sheet starts with two buttons side by side, **New saved meal** and **Add an estimate**, then shows four lists:

- **Recent**: the foods and saved meals eaten most recently, newest first, up to 12, from [recent items](../features/quick-logging.md#recent-items-and-the-last-amount). Each row shows "Last 250 g", "Last 2 × Medium piece · 110 g" or "Last 1 meal", and a saved meal its source. "Foods and meals you log appear here." when there is none.
- **Favourites**: the foods marked as favourite, newest first, or "Tap any food here or in search, then tap its star.". A favourite eaten before shows its last amount the same way.
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

### A typed barcode

Text of 8 to 14 digits, its spaces left out, is a barcode, not a name. The sheet then sends no search, not even for that text once the field leaves it, and shows no saved meal. One block takes the lists' place under the field, headed "Barcode 6408430000258" with the number in the monospaced face. Under the heading, **Look up**, the one primary button on screen, over the line "Finds it among your foods and on Open Food Facts.". Nothing is sent while typing. Only **Look up**, or Enter, [looks it up](../features/foods.md#looking-up-a-barcode). While the lookup is out the button turns busy and reads "Looking up…", and a second press sends nothing. A changed number forgets the answer for the old one.

- A food found opens its food view at once, as its row would. **Back** shows the food's row under the heading, with focus on it, and sends nothing.
- "No food has the barcode 6408430000258." with **Add it from the label**.
- "This barcode is the shop's own. It changes with the weight or the price, so it cannot find a product." with **Add it from the label**, which leaves the barcode out.
- "Open Food Facts has Eila without all four values." or "Open Food Facts has figures for Eila that cannot all be right.", saying "this product" when it has no name, with **Complete it from the label**.
- "Open Food Facts did not answer." or "Too many lookups at once. Try again in a few seconds." with **Try again** and **Add it from the label**.
- "You have looked up many barcodes this hour. Try again later." with **Add it from the label**.
- "The lookup did not work." with **Try again**, when no answer came or the server failed.
- "Looking up a barcode needs a connection." while the app knows it is offline, with no button, in place of **Look up** or a failure. **Look up** is back as soon as the connection is.

**Add it from the label** and **Complete it from the label** open the own-food sheet filled in, as [adding your own food](#adding-or-editing-your-own-food) says. Once it saves with the same barcode, the block holds that food as found. A found food that [no longer answers to the barcode](../features/foods.md#the-barcode-lookup-in-code) is forgotten, and the block offers **Look up** again. **Try again** and **Add it from the label** stand one above the other. The heading keeps its place in every state, and the block keeps a least height that holds each line with its buttons, so an answer moves nothing in the sheet. When a state takes away the button that held focus, focus moves to the block, also after **Try again** and when the connection drops. A screen reader hears each line once, from one live region, and "Found Eila laktoositon kevytmaitojuoma, Valio." for a food found.

### Scanning a barcode

The camera button opens a sheet titled "Scan a barcode" on top of the log sheet. The camera's picture fills its width at 4:3, with four corners marking the band it reads, and one line under it says what is happening. **Type the number** is alone in the footer in every state, with focus on it as the sheet opens.

| When                                     | The line says                                                             | In the picture                             |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| The camera and the scanner are starting  | "Starting the camera…"                                                    | A turning ring                             |
| The camera is on                         | "Hold the barcode between the corners."                                   | The band, and **Torch** where there is one |
| The camera was refused                   | "Hovimestari cannot use the camera. Allow it in your browser's settings." | The camera icon                            |
| There is no camera, or none for the page | "No camera was found. Type the number instead."                           | The camera icon                            |
| Another app has the camera               | "Another app is using the camera."                                        | The camera icon and **Try again**          |
| The scanner did not load                 | "The scanner did not load. Type the number instead."                      | The camera icon                            |

The corners, **Torch** and the turning ring sit on the camera's picture, which looks the same in either theme, so they are drawn [in paper and ink that keep their colours](colors.md#over-the-camera) and show on a white label and a dark counter alike. **Torch** sits at the bottom of the picture and turns the camera's light on and off. It is paper while off and ink while on.

A code held in the band [is read](../features/foods.md#scanning-a-barcode) as soon as the camera sees it, with a short buzz where the phone can. The sheet closes, the field holds the code, and [the barcode block](#a-typed-barcode) looks it up at once, as **Look up** would. Focus goes to the block. The status line says "Barcode read: 6408430000258." for six seconds. A food found opens its food view at once.

**Type the number** closes the sheet and puts focus in the search field. A swipe down, a tap above the sheet or Escape closes it too, with focus back on the camera button.

### Logging again in one press

A recent item, a saved meal, and a favourite with a last amount, has a round **+** at the end of its row. A saved meal's **+** logs its last count, or one meal when it was never eaten. One press logs it again with [its last amount](../features/quick-logging.md#logging-again): eaten on today and past days, planned on a future day. So an item eaten before takes two presses from the Day tab, **Log food** and **+**. Its name for a screen reader says what it adds, such as "Log Rahka again, 250 g" or "Plan Rahka, 250 g".

While it logs, a ring turns in the pressed **+** and every **+** waits. The sheet then closes as the answer arrives, and the line above the tab bar says "Logged Rahka, 250 g." or "Added Rahka to the plan." with **Undo**. After "Could not confirm. Try again." the app reads the day again, so an entry that landed shows on the Day tab. Pressing **+** again then sends [the same request](../features/quick-logging.md#writes-from-the-web-app), so the item is logged once. A [request the server already had](../features/quick-logging.md#a-request-sent-twice) says "Already logged Rahka." or "Rahka is already in the plan." with **Log another** or **Plan another**, which logs it once more. One removed since says "This was removed. Log another?" with **Log another**.

### A food

Tapping a food's row opens it in the same sheet. The top row holds **Back**, the food's name on one line and the favourite star. The body starts with the log block:

1. Chips for the unit: "g", then each portion with its weight, such as "Medium piece · 125 g". The chosen chip is in the accent. The row scrolls sideways on a phone and runs to the sheet's edges, as [chips that scroll](shell.md#the-sheet-primitives) do.
2. **Amount**, the grams or the count of the chosen portion, filled in with the last amount. A food never logged opens empty, with "Enter an amount to see its figures.".
3. "For this amount" and the calories, protein, carbs and fat it comes to, side by side.
4. **Eaten or planned**: Eaten on today and past days, Planned and fixed on a future day with "Future days hold planned entries.".

**Log** sits in the footer, or **Add to plan** while Planned is chosen. It waits while nothing is typed. It logs the amount, closes the sheet and shows the same line as **+**. A log that fails keeps the view and what was typed, and says why above the button: "You are offline. Changes need a connection." or "Could not confirm. Check your connection and try again.". **Log** then sends the same request again. A portion removed since says "This portion is no longer available." and the amount turns to grams.

Under the log block, the food's detail:

- its name in the display face, and the name in the other language,
- where the figures come from: "From Fineli" with a link **About the food data** to the credit in [Settings](settings.md#food-data), "Your own food", or "From Open Food Facts" with **See it on Open Food Facts**, once the detail has loaded, and **About the food data**. The first opens the product's own page in a new tab, which a screen reader hears as "(opens in a new tab)",
- for a food Fineli no longer lists, "This food is no longer in Fineli. Its figures are from an earlier release.",
- **Per 100 g**: energy, protein, carbohydrates and fat, one row each, marked by a dot in [the macro's hue](colors.md#the-macro-hues), the figure in ink at the right. Energy is in whole kcal and grams have one decimal always, so the decimals line up,
- **Portions**: each [portion](../features/foods.md#portions) with its weight, to at most one decimal as it was typed, "No portions yet." when there is none, and **Add a portion**. A portion you added has a pencil and opens for editing. Fineli's portions read "Medium piece", "Decilitre" and so on, and cannot be changed,
- for a food you added, **Edit food** and **Delete food**. **Edit food** shows once the detail has loaded, since the form opens on what was saved,
- for an Open Food Facts food, which nobody edits, **Copy to your foods**, once the detail has loaded. It opens the own-food sheet filled in with the food's name, its four values and its barcode, so you can correct what Open Food Facts has. Your copy then [wins every later lookup](../features/foods.md#looking-up-a-barcode) of that barcode.

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
3. **From (optional)**, empty as it opens. Your sources sit under it as chips: a chip fills the field, and the chip that matches it is in the accent. On a phone the chips are one row that scrolls sideways. From `md` they wrap, so a mouse reaches every one. A source too long for the row is cut short with an ellipsis, there and in the chips over the saved meals. Hovering a chip shows its whole name. With no sources yet, the line under it says "Such as a delivery service.".
4. **Per meal**: **Calories** and **Protein** over **Carbohydrates** and **Fat**, each with its unit. The line under them says "Copy the figures from the label or menu.", and the first refused figure's reason when one is refused.

On a phone they come one under the other, in that order. From `md` a new meal's Eaten or planned sits beside the name, as tall as the name field, with From and its chips across the width under them. An edit has no choice, so its Name and From each take the width, one under the other.

A new meal's **Save and log**, or **Save and add to plan** while Planned is chosen, saves the meal and logs one of it in one request. Both sheets then close together and the line above the tab bar says "Saved Chicken bowl and logged 1 meal." or "Saved Chicken bowl and added it to the plan." with **Remove from day** or **Remove from plan**, which takes the entry off and leaves the meal saved. **Save meal**, on its own row over the buttons on a phone and at the start of their row from `md`, saves the meal without logging it: the sheet closes, the log sheet stays on its lists with the meal in them, and its status line says "Saved Chicken bowl.". A save that could not confirm keeps what was typed. Pressing again makes one meal and logs it at most once, with what is on screen, by [the rule for a save that could not confirm](../features/saved-meals.md#a-save-that-could-not-confirm). An edit's button reads **Save meal**, and a saved edit says "Saved Chicken bowl." on the status line too.

An edit has **Delete** in its footer, over Cancel and Save meal. It asks first, with the same words as **Delete meal**, in a confirmation stacked on the edit sheet. After a delete the edit sheet closes and the log sheet shows the lists, with focus in the search field. The chips under From stay as they opened while the sheet is open, and a new source joins them.

From the Day tab a new delivered meal takes seven taps and five typed values: **Log food**, **New saved meal**, the name, then Protein, Carbohydrates and Fat, and **Save and log**. Calories follows the name by Enter.

### An estimate

**Add an estimate** opens a sheet titled "Add an estimate" with "For a meal you cannot weigh, such as a restaurant dinner.". It asks for **Eaten or planned** first, then the name, the four figures two by two, and **Note (optional)**. From `md` Eaten or planned sits beside the name. **Save estimate** logs it to the sheet's day, both sheets close together, and the line above the tab bar says "Logged Restaurant dinner." with **Undo**. The day marks it as an [estimate](../features/days.md#estimates).

### Adding or editing your own food

The own-food sheet is titled "Add a food" or "Edit food". It asks for **Name**, then under **Per 100 g** and "Copy the values from the label." the four values **Energy** (kcal), **Protein**, **Carbohydrates** and **Fat** (g), each on one row with its label on the left and the field on the right, then **Barcode (optional)**. A new food's fields open empty, apart from a name the search typed, or what [a barcode lookup](#a-typed-barcode) brought back: the barcode, and from Open Food Facts the name and every value it had. A sheet filled from Open Food Facts adds a line under the hint, "Check each value against the label. Some came from Open Food Facts.". A value left as it opened [saves as that figure](../features/foods.md#looking-up-a-barcode), so 3.125 g saves as 3.125 g. An edit opens with what was saved. **Save food** reads "Saving…" while it works. Each field shows what is wrong in a line under it, such as "Enter a value from the label." or "One of your foods already has this barcode.". When protein, carbohydrates and fat together pass [the limit for a food](../features/foods.md#your-own-foods), the line under **Fat** says "These three add up to more than 100 g." and all three fields are marked. A screen reader reads that line with each of them. An edit of a food already over the limit opens with its numbers and shows the same line on Save, also when only the name changed. A number that [may hold a thousands group](../features/foods.md#your-own-foods), such as "1,500", says "No comma or point, or fewer decimals.". An edit also offers **Delete**, which asks as above, from the own-food sheet or the food alike.

A saved new food opens in its food view. A saved edit updates it. The lists and every earlier search show the change as soon as they are back on screen, with one limit: after a new food or a changed name, a search for other text is read again, and the lists show in its place until it answers.

### Portions of your own

The portion sheet is titled "Add a portion" or "Edit portion", with **Name** and **Weight** (g), and **Save**. An edit also offers **Delete**, which asks "Delete this portion?" with "This removes “Purkki” from the food's portions.". A saved or deleted portion shows in the food view as the sheet closes. After a delete, focus is on **Add a portion**.

### On a phone

The sheet slides up from the bottom and stops 3rem below the top, so the Day tab still shows above it. A finger on the handle drags it down to close it, and so does a tap above it. A food or meal view with a changed amount, or a log on its way, refuses the swipe and springs back, and **Back** still leaves it. No field takes focus as it opens, so no keyboard rises while it slides. A **+**, **New saved meal** and **Add an estimate** ignore a press until the sheet has finished sliding in, so the second tap of a double tap on **Log food** does nothing. While the sheet slides away after a log it [catches every tap](shell.md#sheets-and-dialogs), so the second tap of a double tap on **+**, **Log**, **Save and log** or **Save estimate** reaches nothing under it. From `md` a mouse double click on them reaches nothing under the dialog either. **Log** rides above the keyboard with the footer, and the amount field stays in view. The scanner and the own-food, portion, saved meal and estimate sheets slide up on top of it, and the log sheet shrinks a little behind them, its handle fading so only the top sheet's shows. Every row is at least 56 pixels tall, and the star and every **+** are 44 pixel targets.

## How it works

### Route and entry

The sheet is `FoodSheet` in `apps/web/src/components/foods/`, opened by `DayLauncher` in `apps/web/src/components/day/` with the day shown. The launcher keeps it mounted while it slides out and gives it a fresh mount on every open. It waits while the app [asks the server for today](day.md#across-midnight).

The food search is `useFoodFinder`, a hook rather than a component, because its parts go into three slots of the sheet that hosts it: the search field in the header, the results in the body, and the scanner and own-food sheets in the sheet's `stacked` slot. It holds the text and its debounce, the barcode mode, the scanner and the own-food sheet, and renders nothing about logging. A food pressed, or found by barcode, goes to the host. `FoodSheet` puts its own browse lists and its saved meals that match (`Browse` and `MealResults` in `FoodSearchView`) in the finder's slots, and the recipe editor's [ingredient picker](recipes.md#adding-an-ingredient) puts its favourite and own foods there. The amount's figures under the field are `AmountFigures` in `apps/web/src/components/log/`, and the chips of a food's portions come from `foodChipsOf`, which the picker shares. The search view's other parts sit beside it: `useBarcodeMode`, `BarcodeResult` and `useBarcodeLookup` for a typed barcode, `ScannerSheet` with `scanner/useScanner`, `scanner/useCameraStream` and `scanner/decoder` for a scanned one, `FoodRow`, `SearchField`, `FoodDetail` for a food's header and detail, `FavouriteButton` and `FoodSourceLine`. `useSheetNavigation` holds the views as a stack, each with its scroll position and the row that opened the next. `FoodSheetStack` renders the stacked `ScannerSheet`, `OwnFoodSheet`, `PortionSheet`, `SavedMealSheet` and `EstimateSheet` and the delete confirmations.

The logging parts are in `apps/web/src/components/log/`: `StatusLine`, `CreateActions`, `RecentList`, `SavedMealList` with `SourceChips` and `mealFilter`, `SavedMealRow`, `LogAgainButton` and `useLogAgain` for **+**, `LogBlock`, `LogFooter` and `useLogForm` for a food's or a meal's log, `MealView`, `ArchivedMealsView` and `useMealActions` for archiving and restoring, and the two form sheets `SavedMealSheet` and `EstimateSheet` with `mealForm`.

### Layout

The sheet is a [`BottomSheet`](shell.md#the-sheet-primitives) with `size="tall"`: one fixed height, `100dvh` less the top inset and 3rem on a phone, and `min(48rem, 100dvh - 2rem)` as the centred `md:max-w-lg` panel from `md`. Its height never follows its content, so its top edge is the same in every view and state, with and without the footer, also with a keyboard up. The status line is one line whose room is always kept, so the search field and **Back** under it never move. Measured on a production build at 375 by 667 and 390 by 844, the top edge and the status line hold to the pixel across the search, the results, a food, a meal, a failure on the status line and an emulated keyboard.

The barcode block is the first thing in the search view's body, under the field. Measured on a production build at 320 by 568, 390 by 844 and 1280 by 800, in both themes, the field and the block's heading hold to the pixel from typed to busy to every answer and failure, offline and back online, and the block keeps its least height of 208 pixels. The tallest state it holds is a failure with a two-line line and both buttons at 320 wide, which ends 14 pixels inside it. A found food's row with a long name grows the block downward, to 256 pixels at 320 wide, and moves nothing above it. **Look up** sits over its line, so with an emulated keyboard at 320 by 568 it ends 61 pixels above the keyboard. No sheet body scrolls sideways, also for a 100-character product name that holds a 32-letter word.

The camera button and the cross share one 44 pixel slot at the field's end, so the field never changes. Measured on a production build at 320 by 568, 390 by 844 and 1280 by 800, the field's box is the same to the pixel empty with the camera, typed with the cross, holding a code and cleared again.

The scanner is a `BottomSheet` as tall as its content, the `md:max-w-lg` dialog from `md`. Nothing in it changes size from one state to another, so it opens at one height however fast the camera answers. The picture is 4:3 at the body's width, and **Try again** and **Torch** sit inside it. The footer holds **Type the number** alone, the full width on a phone and at the end of the row from `md`. The line under the picture keeps the height of the longest line any state can show at that width, and every line fits two lines at 320 wide. Measured on a production build at 320 by 568, 375 by 667, 390 by 844 and 1280 by 800, in both themes, the sheet's top edge, the picture and the footer hold to the pixel across starting, the camera on, a refusal, no camera, a busy camera and **Try again**, and a scanner that did not load, whether the state follows starting or the sheet opens straight into it. At 320 by 568 the sheet starts 118 pixels down, and at 390 by 844 341 pixels down.

The log block fits the first screen of a phone with the keyboard closed: the amount's label sits beside its field, and the four figures share one row. The field is 11rem wide, so "1234,5" beside "portions" and "99,75" beside "meals" show in full, and it keeps that width in grams too, so choosing a chip never moves it. At 375 by 667 the block ends 99 pixels above the footer. The amount keeps one line of room under it for its error, and "For this amount" keeps its line. Eaten or planned keeps no line. On a future day it shows "Future days hold planned entries." under it, and the block ends 73 pixels above the footer. The day is fixed while the sheet is open, so that line does not come or go while you type. The refusal line no field owns sits in the footer above **Log**, as every [form sheet's](shell.md#the-sheet-primitives) does. On a phone it keeps no room while empty: a refusal grows the footer upward, with **Log** where it was. From `md` it keeps two lines of room, so a refusal moves nothing.

Focus follows [the sheet conventions](shell.md#the-sheet-primitives). On a phone the body takes focus as the sheet opens. From `md` the search field does. Opening a food or a meal puts focus on **Back**. Back puts it on the row that was opened, in the list it was opened from, or in the field when that row is gone, and back from the archived meals on **Archived meals**. After a read, focus is on the barcode block, after **Type the number** in the field, and after any other close of the scanner on the camera button. A log, "Save and log" and "Save estimate" return focus to the launcher. A sheet on top of the log sheet that closes alone returns focus to the button that opened it.

`SavedMealSheet` and `EstimateSheet` are [`FormSheet`s](shell.md#the-sheet-primitives) with the `md:max-w-lg` dialog, as wide as the log sheet under them. Each is as tall as its form and holds that height once open, so a line that appears moves nothing above it. Their four figures are `FigureFields` from `apps/web/src/components/entries/`, two by two at every width, so each field shows a value such as 1234,5 in full. The line under them keeps one line of room, and every refusal a figure can show fits it at 320 pixels wide. From `md` two fields share a row (`pairRow`), and **Save meal** shares the buttons' row. On a phone the saved meal sheet's footer holds **Save meal** on a row of its own.

Measured on a production build:

- At 390 by 844 both show their whole form, the new saved meal sheet with one row of source chips, and neither body scrolls.
- At 375 by 667 the estimate sheet shows Eaten or planned, the name and the four figures, and its note follows on a short scroll. The new saved meal sheet shows Eaten or planned, the name, From with its chips and the Per meal heading.
- At 320 by 568 the estimate sheet shows the choice, the name, and Calories and Protein. The new saved meal sheet shows the choice, the name and From. Both scroll for the rest.
- At 1280 by 800 the estimate dialog and the saved meal dialogs, with one row of source chips, show their whole form with no scroll. At 1366 by 768 the saved meal dialogs reach the viewport less 2rem and their body scrolls 21 pixels. Each further row of chips adds about 52 pixels. Neither scrolls sideways, whatever the sources' names.

`OwnFoodSheet` and `PortionSheet` are [`FormSheet`s](shell.md#the-sheet-primitives) too, as tall as their forms and held at that height once open, so their tops and Save hold still whatever lines appear under the fields. Every field keeps one line of room, and every line it can show fits it at 320 pixels wide, so an error moves no field below it. The own-food sheet's four values are `DecimalField`s with `layout="beside"`. At 390 by 844 it shows its whole form. At 375 by 667 the Fat row is the last in view, and at 320 by 568 Carbohydrates. From `md` the own-food dialog reaches the viewport less 2rem, and its body scrolls 43 pixels at 1280 by 800 and 75 at 1366 by 768. Their numbers are `DecimalField`s read with `parseDecimalInput`, at the decimals [the catalogue holds](../features/foods.md#your-own-foods): two for energy, three for a macro and one for a weight. A saved figure left as it opened in an edit is sent as saved, unread, and a name left as saved is sent unchecked, as [the server checks only a changed one](../features/foods.md#your-own-foods).

### Logging

Every add goes through `useEntryActions` on the Day tab, as [writes from the web app](../features/quick-logging.md#writes-from-the-web-app) say: it carries an id the app chose, and its answer puts the day into the cache, so no day is read again for it. An add that could not confirm reads its day again. The figures a food or a meal shows for an amount are `entryFigures` on the food's per-100 g values or the meal's figures, the function the server runs, so they are the figures **Log** stores.

A log closes the sheet as its answer arrives, with the pressed **+** or **Log** busy while it slides out. A closing sheet catches every tap until it has gone, by `closingSheet.ts` under [the sheet primitives](shell.md#the-sheet-primitives), so the second tap of a double tap reaches nothing under it. The add's line shows once the sheet has slid out. "Save and log" and "Save estimate" close their own sheet and the log sheet in the same update, so the two slide out together and focus lands on **Log food**.

### Data and refresh

Every food read is keyed under `["foods"]`, the recent items under `["log", "recents"]` and the saved meals under `["savedMeals", "list", archived]`. The Day tab reads the recent items, the favourites, the active saved meals and your foods once its day is on screen, so the sheet opens with them. The archived meals are read only when their view opens. A write puts its own answer into the cached reads first, through `apps/web/src/lib/foodCache.ts`, then reads again. A list not on screen comes back with the write in it at once, before its read lands, with one limit: after a new food or a new name, a search whose text is not exactly that name is read afresh, and while that read is out the lists show in its place. The function for each write is in `apps/web/src/lib/invalidation.ts`.

- The lists read `GET /log/recents`, `GET /foods/favourites` and `GET /foods/own`. The recent items are read again when the page is shown or the connection returns.
- An open list never reorders under the finger (`apps/web/src/components/log/heldList.tsx`). Recent, Favourites, Saved meals and Your foods each hold the order and the rows they showed while they can be pressed. A read that lands later, from the page shown again, the connection back, a mount or an add that could not confirm, changes a row's own data in place and moves no row. A list with no rows yet waits for the others: no list shows a row until every list has its first answer, from the cache or the server, or cannot be read, and then all of them show in one render. A press that started before those rows were painted reaches nothing. Rows that came after a wait take presses half a second after they are painted, as a sheet that slides in does, so a finger aimed a moment before lands on nothing. Rows that are there at once take presses at once. The create actions and the search field work all the while. A list follows what is read only while it cannot be pressed: as the sheet slides in on a phone, and while a sheet stacked on it is open. It starts again from what is cached when it shows again, back from a food or a meal, so a write made there is in it. A meal saved from the stacked sheet takes its place by name as that sheet closes, and a favourite mark the server refused takes its row back out. A food or a saved meal a press finds gone leaves every list at once. Once the sheet has closed, every list a write left stale is read (`prefetchLogLists`), so the next open shows it.
- A search waits for 150 ms of no typing, then reads `GET /foods/search?q=` with the text trimmed and in lower case, so "Rahka" and "rahka" share one answer. A newer query aborts the read it replaces. Nothing is sent for fewer than two characters. Results stay fresh for 30 seconds, so Back shows them from the cache with no request.
- A food reads `GET /foods/:id`, showing the row's own figures until it answers.
- A typed barcode sends `POST /foods/lookup` on a press, and a scanned one as it is read, with its format for an EAN-8 or a UPC-E. The scanner's decoder is fetched from `/_next/static/media/` the first time it opens. What it puts in the cache, and which searches it marks stale, is in [the barcode lookup in code](../features/foods.md#the-barcode-lookup-in-code).
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
- From `md` the saved meal dialogs scroll a little with one row of source chips, and each further row adds about 52 pixels to the scroll.
- On a phone a press on the log sheet is dropped while a sheet on top of it slides away, for about 420 milliseconds.
- A barcode's answer lasts as long as the sheet is open. One that lands after the sheet has closed shows nowhere, and **Look up** at the next open asks the server again, which answers from what it kept with no call to Open Food Facts.
- The scanner has been checked with a fake camera only. What a real phone has yet to show is in [the foods feature's known gaps](../features/foods.md#known-gaps).

## Features on this page

- [Quick logging](../features/quick-logging.md): logging a food, a saved meal or an estimate, logging again with its last amount, the recent items, replays and undo.
- [Foods](../features/foods.md): the catalogue, the search and its order, own foods, portions, favourites and the food-name language.
- [Saved meals](../features/saved-meals.md): saving a meal, alone or with its first log, editing, archiving, restoring and deleting it, and the source filter.
- [Days](../features/days.md): the estimates the estimate sheet adds.
