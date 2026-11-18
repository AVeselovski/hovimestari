# Day

The first tab, at `/`. It shows one day: what was eaten, what is planned, and where both stand against the person's own targets. Today opens first, and any other date is a tap away.

## In detail

### The header

The date bar and **Log food** stay at the top of the tab while the day scrolls under them, at every width. On a wide screen the summary stays beside the entries too, under the date bar, when the window is tall enough to show all of it. The header has the page's own background. While rows are under it, a thin line in the rule colour marks its bottom edge. At rest at the top there is no line. The header never moves and never changes height: the line, a new day, the launcher's wording, a toast, loading, a failure and an empty day all leave it where it is. Rows under the header cannot be pressed through it, and a row the keyboard moves to stops below it.

### The date bar

At the top, the day shown between two arrows, **Previous day** and **Next day**. It is the tab's header: the shell shows no title over it. It reads "Today", "Yesterday", "Tomorrow" or a short date in the device's own format, such as "Tue 17 Nov" or "Tue, Nov 17", with the year after it when it is not this year's. A tap on the date opens the phone's own date picker. Choosing today shows the tab's plain address again.

### Coming back to the tab

The tab remembers the day it showed while the app stays open. Leaving it for another tab and coming back shows that day again, whatever the clock did meanwhile, so a day chosen just after midnight is still there after a visit to Settings. A person on today comes back to today, and the tab keeps following the app to the new day at midnight. Pressing **Day** while on the Day tab goes to today. A fresh open of the app shows today, and signing out forgets the day.

From the keyboard the date is one stop, a button named for the day shown, such as "Choose a date, Today". Enter or Space opens the browser's picker, and so does a click. A date chosen in the picker applies at once, however the picker was opened. Digits typed into the date after a click apply on Enter or when it loses focus, and only as a whole date, so typing a year never passes through an earlier one. A date left half typed goes back to the day shown.

### Log food

Under the date bar, a full-width button drawn like a search field, with the search icon and "Log food", or "Add to plan" on a future day. It opens [the log sheet](log-sheet.md) on the day shown, which logs to that day. While the app checks the date with the server it waits, and so does a second tap of a double tap, which opens the sheet once. A food eaten before is logged again in two presses: **Log food**, then its **+**.

### The summary

The day's figures in two columns, **Eaten** and **With plan**, [the day's two totals](../features/days.md#the-two-totals). One row of column heads at the top serves the whole summary. It marks Eaten with a solid square and With plan with an outlined one, as the gauge draws them. With nothing planned the two columns are the same. A future day shows zeros under Eaten and the plan beside them.

Calories come first, then protein. Each has its label, the person's range for that day ("1900 to 2200 kcal"), a gauge and, in each column, the figure in large type and its distance from the range:

- "660 kcal below the range" or "38 g below the floor" while under the lower bound.
- "120 kcal to the upper bound" from the lower bound to the upper. A screen reader hears "In the range, 120 kcal to the upper bound".
- "80 kcal above the range" past the upper bound.

The distance is a position. Nothing on the tab calls a day good or bad, and nothing turns red or green past a bound. How a position and a distance are computed is in [where a day stands](../features/days.md#where-a-day-stands).

Carbohydrates and fat follow as a two-row table in the same columns. Each row has its coloured dot and its label, "Carbs" or "Fat", in a lead of fixed width at the start, then the Eaten figure straight after it. The With plan figure starts at its column's start, under the large figure above it. They have no range and no gauge.

Two lines close the summary. One says "These totals include an estimate." or, when only the plan holds an estimate, "With plan includes an estimate.". A figure from a reading with an estimate starts with "≈". On a past day the other says how many planned entries were never marked eaten, such as "2 planned entries were never marked eaten.".

### The gauge

One track per macro, the person's range drawn on it as a grey band between two dark ticks. The track runs from zero to a quarter past the upper bound, so the band and the ticks stay where they are all day. The eaten part fills from the left in the macro's colour. The planned part continues it as a lighter tint inside a border of the same colour. A total past the end of the track squares off the track's end with a short cap, solid for eaten and tinted for planned. A very narrow range is drawn a little wider from its lower bound, so the protein floor's tick is always exact. The fills ease to their new width when a figure changes. The colours are in [the gauge's colours](colors.md#the-gauge).

### The entries

Under the summary, "Entries", and each entry in the order it was added. A row holds a mark at its start, then the name, one line with the amount ("250 g", "2 × Medium piece · 110 g", "1 meal · Foodora" or "Estimate"), and the entry's calories over its protein, each with its dot. An estimate's figures start with "≈". A day with nothing on it says "Nothing logged yet.", or "Nothing planned yet." on a future day.

The mark says the entry's state:

- An empty circle: planned, on today or a past day. A tap marks it eaten.
- A filled check: eaten.
- A dashed circle: planned on a future day, which cannot be marked eaten yet.

**Mark all eaten** in the "Entries" row marks every planned entry on the day. It shows on today and past days while anything is planned.

A tap on the rest of a row opens the entry sheet.

### The entry sheet

Titled with the entry's name, two lines at most. The fields come in this order, and Tab follows it:

1. The choice between **Eaten** and **Planned**, for every kind of entry, so marking a planned entry eaten is in the first screen of a phone. On a date after today only Planned can be chosen, and the line under the choice says "Future days hold planned entries.". That line keeps its room on every date.
2. The amount. For a food, chips over the field choose grams or one of the food's portions, and the field takes the grams or the count. For a saved meal, the number of meals. For an estimate, its name, its four figures two by two, **Calories** and **Protein** over **Carbohydrates** and **Fat**, and a note. Enter in the name moves to Calories. Each number field names its unit at its end: "g", "portions", "meals" or "kcal".
3. The figures that amount comes to, with "For this amount" over them, or "Enter an amount to see its figures." while the field is empty. A changed count of the entry's own portion, before the food's portions have loaded, says "Figures update when you save.".
4. The date. Changing it moves the entry to that day.

**Save** stores every change in one go, the amount and Eaten included. **Remove entry** takes the entry off the day. While the keyboard is open, the row of **Remove entry** makes way for it, so **Save** stays above the keyboard. A refusal under a field goes away as soon as the field changes, and a refused save scrolls to the field it refused, its line in sight. A save or a removal that fails says why in the line above the buttons, which stays in sight, and keeps what was typed. A food that was deleted since says "This food is no longer in your foods." and a deleted saved meal "This saved meal was deleted.". Both can still be changed. [Adding and changing an entry](../features/quick-logging.md#adding-and-changing-an-entry) has the rules a save follows.

### Undo

Every log, mark, save and removal shows a line above the tab bar with **Undo** for six seconds: "Logged Rahka, 250 g.", "Added Rahka to the plan.", "Marked Rahka eaten.", "Marked 3 entries eaten.", "Marked Rahka planned.", "Moved Rahka to tomorrow.", "Saved Rahka." or "Removed Rahka.". A log's line shows once the log sheet has slid out. Undo puts back exactly what changed, by [quick logging's undo](../features/quick-logging.md#undo). An undo that could not be confirmed says "Could not undo." with **Try again**. One the server refused says why, with no action.

### Without a connection

A day already read stays on screen offline. A mark sends nothing and says "You are offline. Changes need a connection.", and so does the entry sheet's line above its buttons. A day never read says "This day needs a connection.". A day that fails to load says "This day did not load." with **Try again**. A mark that got no answer says "Could not confirm. Check your connection and try again." with **Try again**, which sends the same mark again. [Without a connection](../features/quick-logging.md#without-a-connection) has the rules.

### Across midnight

The tab follows the day the server names, in the person's time zone. Left open past midnight, it moves to the new day by itself once the server agrees, and an open entry sheet keeps what was typed in it. While the app checks the date with the server, the marks, Mark all eaten, Log food, Save and Remove entry wait, and Cancel stays free. [Today and the time zone](../features/targets.md#today-and-the-time-zone) says when the app asks.

## How it works

### Route and entry

`apps/web/src/app/(app)/page.tsx` renders `DayTab` from `apps/web/src/components/day/` inside `Suspense`, because the tab reads `?date=`. The tab sits behind the shell and [the first-run gate](../features/targets.md#the-first-run-gate). A real date in `?date=` shows that date. Anything else shows today, from `useToday()`. The arrows and the picker change the address with `router.replace`, so Back leaves the tab rather than walking through days.

The tab writes its `?date=` to `lib/shownDay.ts` whenever it changes, and nothing when it shows today by its plain address. The tab links (`NavLinks` in `apps/web/src/components/shell/`) read it: from another tab the Day link is `/?date=` that day, and on the Day tab it is `/`. The address stays the truth, so a reload, a shared link, Back and Forward all show the day their address names. The memory lives only in the page, so a new page load starts on today. `AuthContext` clears it when a session ends.

`DateBar` lays the platform's date input over the date button, invisible and out of the Tab order, so a tap on a phone lands on the input. A click and the button's Enter or Space call `showPicker()`. The bar tells typing from a choice by the keys pressed on the input itself: a digit, an arrow, Backspace or Delete there starts typing, and opening the picker again ends it. The picker's own keys never reach the page, so a choice made in it with the keys applies at once. A typed date applies only with a four-digit year from 1900 to 2999.

### Layout

On a phone, one column, top to bottom: `DayHeader` with `DateBar` and `DayLauncher`, then `DaySummary` and `EntryList`. The shell shows no title on this tab, so the date bar sits 8 pixels under the status bar. The date bar is one 44 pixel row, 16 pixels over the launcher, which is 48 pixels tall. The summary starts 24 pixels under the launcher, and the entries follow it 12 pixels apart. The header is 140 pixels tall on a phone. From `md` it keeps 32 pixels above the date bar, so it is 164 pixels tall at 768 by 1024.

`DayHeader` is `position: sticky` at the top of `<main>`, the shell's one scroll container, so the phone's overscroll, the toast's room and the sheets' scroll lock behave as on every tab. The shell's header above it keeps the status bar's room. The page starts flush (`PageContainer untitled`), and the header holds the room above itself and the clearance under the launcher, so it is in the same place at rest and while it stays. Its sizes are the `--day-header-*` tokens in `globals.css`. Its bottom edge is always one pixel, in the page colour at rest and the rule colour once `<main>` is scrolled (`useScrolledUnder`), and that pixel counts in the clearance. It sits at `zPageHeader`, under the shell. The content under it carries `under-day-header`, which gives every element a `scroll-margin-top` of the header's height (`--day-header-height`), so focus never lands behind it. The offline line pushes `<main>` down on every tab, and the header moves with `<main>` by the line's 37 pixels, unchanged inside. The page keeps the room of the tallest toast at its end (`PageContainer clearToast`), so a toast never covers the last row's mark.

From `lg` the tab is two columns in a 64rem column: the date bar over the summary on the left, the launcher over the entries on the right. The header is that first row, and it stays in view across both columns. The summary and the entries start at the same height, 24 pixels under the launcher. At 1280 by 800 both start 104 pixels from the top, and ten entries show in full, by the length of their names. Below `lg` the summary scrolls away under the header with the entries. From `lg` it stays too, right under the header, while the entries scroll beside it, on a viewport at least 680 pixels tall (`summary-stays` in `globals.css`). That height holds the header, the tallest summary, the toast's room and the offline line, so the summary's end is always in view while it stays. On a shorter viewport it scrolls with the page. `EntrySheet` from `apps/web/src/components/entries/` is a `FormSheet`, mounted by `DayTab` above the date's content, so a new date or a refresh never unmounts an open sheet. The undo line is the shell's toast, in [Toasts](shell.md#toasts).

The summary is sized so the entries start on the first screen. The figures are the largest type on the tab. The distance lines, the ranges and the notes are small type on a phone and body size from `md`. Measured on a production build, the summary is 316 pixels tall on today and 332 on a past day at 390 by 844, 332 and 348 at 375 by 667, and 348 and 364 at 320 by 568. On today the first entry starts 513 pixels from the top at 390 by 844, with four entries in full above the tab bar, and 529 at 375 by 667, with one. On a past day they start 16 pixels lower, with three and one. At 768 by 1024 six show on both. At 320 by 568 the summary fills the first screen, and the "Entries" heading sits just under the tab bar.

Nothing moves. Every line that can change keeps the room of its longest form at the width it is shown at. Each distance keeps the room of its macro's three forms at a distance of 8888.8, such as "8888.8 kcal to the upper bound", in both columns. That is one line at 390 pixels and wider, and two lines at 320. At 375 the calories line keeps two lines and the protein line one. The estimate line is kept on every day, and the unmarked line on every past day. The loading frame shows the labels and empty tracks. A failure and offline lay their line over the summary's frame, at the same height. A row's height depends on nothing but its name, so marking it moves no row.

The entry sheet is as tall as its form, and [holds still](shell.md#the-sheet-primitives) once open. Its estimate's figures are a two by two grid with one shared line under it, which keeps one line of room, and every refusal a figure can show fits it at 320 pixels wide (`FigureFields` in `apps/web/src/components/entries/`). The name, the note, the amount and the date keep one line each. Measured on a production build with the keyboard closed:

- At 390 by 844 an entry for a saved meal shows its whole form. An entry for a food shows it down to the date, and the empty line under the date follows on a 28 pixel scroll. An estimate shows its state, its name, its four figures, its note and the caption "For this amount", and the figures under that caption follow on a scroll.
- At 375 by 667 a food entry shows its state, the amount and "For this amount", and an estimate its state, its name and its four figures.
- At 320 by 568 a food entry shows its state and the amount, and an estimate its state, its name, and Calories and Protein.

Every position on the gauge comes from `gaugeGeometry` in `gaugeGeometry.ts`, as a share of the track's width. `Gauge.tsx` draws it.

### Data and refresh

`dayQuery(date)` reads `GET /days/:date`, one cache entry per date, fresh for 30 seconds and read again when the page is shown or the connection returns. The tab reads the days before and after ahead of time. Once its day is on screen it also reads the recent items, the favourites and your foods, so the log sheet opens with them. `useEntryActions` in `apps/web/src/hooks/` holds every write and its undo. [Writes from the web app](../features/quick-logging.md#writes-from-the-web-app) says how each write reaches the cache. While `useToday()` reports `holding`, the marks and the sheet's Save and Remove entry send nothing. The entry sheet's figures are `entryFigures` on the entry's stored basis, the function the server runs, so the figures shown are the ones Save stores.

### Focus

A chevron keeps focus when the day changes, and so does the date button. A mark sent from the keyboard moves focus to the row once the check replaces the circle, and Mark all eaten to the first row. The entry sheet returns focus to its row, and after a removal to the next row, else the row before, else Log food. A toast never takes focus. F6 reaches it. An Undo pressed from the keyboard puts focus on the main button of the row it changed. When the row is on screen, such as after a mark or a save, focus moves there as Undo is pressed, before the toast hides. A removed entry's row, or a moved one, takes focus once it is back. A row takes focus for one Undo only once, so the row shown again later, after a change of day, leaves focus where it is. An Undo pressed with a pointer leaves focus where it is.

### Known gaps

- From `md` the unit chips wrap, so a food whose portions load after the sheet opens can push the amount field down a row.
- From `md` the entry sheet opened on an estimate holds more than its dialog shows, and scrolls on a laptop.
- A distance of five digits takes one more line at 390 pixels and wider, which moves what is under the summary.

## Features on this page

- [Days](../features/days.md): the day, its two readings and where each stands.
- [Quick logging](../features/quick-logging.md): adding entries through the log sheet, marking, editing, moving and removing them, and their undo.
- [Targets](../features/targets.md): the ranges the summary measures against, and today.
- [Foods](../features/foods.md): the foods the log sheet finds and logs.
