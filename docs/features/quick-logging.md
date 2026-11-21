# Quick logging

Quick logging is how entries reach a [day](days.md#a-day-and-its-entries) and change there: adding, editing, moving, marking eaten, copying, removing and restoring, each with an undo. Recent items offer the foods and meals the user ate lately, with the amount of the last time, to log again in one action.

## In detail

### Adding and changing an entry

An entry is added to a date, planned or eaten. An eaten entry on a future date is refused. A food entry takes grams or a count of a portion. A [saved meal](saved-meals.md#a-saved-meal) entry takes a count of meals. A [recipe](recipes.md#a-recipe-on-a-day) entry takes a number of servings. An [estimate](days.md#estimates) takes its name, figures and note. A portion count whose weight rounds to zero or comes to more than 5000 g is refused.

An entry's amount can be changed later: the grams or portion count of a food entry, the count of a saved meal entry, the servings of a recipe entry, and the name, figures and note of an estimate. A changed portion count is weighed at the portion's grams today. Every change keeps [the figures the entry was added with](days.md#figures-that-stay).

Moving an entry changes its date and keeps its place in the order. Moving an eaten entry to a future date makes it planned, unless the move says eaten, which a future date refuses. A move can also mark the entry eaten or planned.

### Marking eaten

[Planned and eaten](days.md#planned-and-eaten) entries can be marked either way, one at a time or up to 100 at once, such as everything planned on a day. Marking several entries changes the ones that are still there and skips the rest, so an entry removed on another device never blocks the others. Marking eaten skips an entry dated in the future. Each mark eaten records the time of that mark.

### Copying entries

Copying entries to another day adds them there as planned, with the figures of the entries they copy, in their original order, after what that day already holds. A copy is planned on every date, today and past days included, so a copy onto a past day counts among its planned entries never marked eaten until it is marked. Up to 100 entries copy at once. A day whose saved meal was deleted since copies too. A copy of an entry from a batch [logged as made](recipes.md#logging-as-made) plans its recipe again: it is a plain entry of the recipe with the recipe's figures at the moment of the copy and no batch, also when the recipe was deleted since. Each copy carries its own new id, and no two ids in a request may match. A source may repeat, so one request can add the same entry to the day several times.

On screen, the copy sheet copies the ticked entries of the day shown to one date. Each pair of a date and an entry gets one id for as long as the sheet is open, so pressing Copy again after it could not confirm sends the same ids and adds each copy once. A copy sent to a date or for an entry that the person then changes or unticks takes new ids for the new pairs. Once that send succeeds, every copy sent earlier from the same sheet and not sent now is removed, before the line that says the copy is done. Cancel after a copy that could not confirm reads the day it went to again, so whatever landed shows there. Nothing ticked sends nothing.

### Recent items and the last amount

Recent items are the foods and saved meals the user ate most recently, newest first, each once. Twelve by default and 30 at most. Only eaten entries count: what the user planned and never ate is not recent. An estimate is never a recent item.

Each recent item carries the amount of its latest eaten entry: the grams of a food, and the portion and count when it was typed as a portion, or the count of a saved meal. An amount changed while marking an entry eaten is the one remembered. A food's detail and each [favourite](foods.md#favourites) carry the same last amount, or none for a food the user never ate. A saved meal carries the count of its latest eaten entry.

A food the user can no longer see, and an archived or deleted saved meal, is left out. A retired Fineli food stays. When the portion of a last amount was removed, the amount keeps its grams and its label, and its portion id is null, so the grams are what is offered.

### Logging again

Logging a recent item again adds an entry with its last amount. It is an ordinary entry, and takes the food's or the meal's values as they are now. The request names the date and whether the entry is planned or eaten.

### The log sheet

The log sheet is where an entry is added on screen, to the day it opened on. Before anything is typed it offers what the user is most likely to log: a new saved meal and an estimate first, then the recent items, the favourites, the saved meals and the user's own foods. A recent item, a saved meal, and a favourite eaten before, logs again with its last amount in one action, so a food eaten before takes two presses from the day. A saved meal never eaten logs one meal.

A meal the user has not saved yet is [saved and logged in one action](saved-meals.md#saving-and-logging-a-meal), as one request. A meal that cannot be weighed is logged as an estimate with its typed figures.

A food or a saved meal opened in the sheet starts from its last amount, and shows the figures that amount comes to before it is logged. The figures are those the entry will store, computed by the same function the server runs. A food never eaten starts empty.

An entry is logged eaten on today and past days. On a future day it is planned, and only planned. On today and past days the user may choose planned instead, for a meal planned for later. The sheet keeps logging to the day it opened on, also past midnight.

### A request sent twice

Each add, copy, new saved meal and save-and-log carries an id the app chose for it. Sent twice, for example after a timeout on a weak signal, it adds one entry or one meal and answers the first one again, saying it was already logged. That holds also when the two arrive at the same moment. A copy sent twice adds each entry once and answers the second with the same entries.

### Undo

Every logging action has an inverse:

- An add is undone by removing the entry.
- Marking entries eaten is undone by marking exactly the entries it changed as planned.
- A remove is undone by a restore, within ten minutes. The entry comes back exactly as it was, with its place in the day and its figures, even when its food or meal was deleted since.
- A move is undone by moving back, eaten again when the move made it planned.
- A copy is undone by removing its copies, up to 100 in one request. Each copy goes whatever happened to it since, edited, marked eaten or moved. Ids that are gone or not the user's are skipped, and each removed copy can be restored for ten minutes like any removal. On screen, Undo removes every copy the sheet sent, also those of an earlier send to another date.

A restore is exact. The other inverses bring back the entry's date, status, amount and figures, but not when it was eaten. Marking an entry eaten again, after it was eaten and then planned, records the time of that mark. The entry then counts as eaten most recently, so it moves to the front of recent items, and its amount becomes the last amount.

After an add was undone, sending the same add again adds nothing, so a late retry cannot bring back an entry the user undid.

An amount entered as a count of a portion is undone as that count, weighed at the portion's grams at the time of the undo. When the portion was edited in between, the grams differ from before. When the portion is gone, the amount is undone in grams.

On screen, every mark, save, removal and copy offers Undo for six seconds. Undo sends the inverse of exactly what changed: the ids a mark changed, a restore after a remove, and every field an edit changed, read from the entry before and the entry the server answered, so a move that planned an eaten entry is undone eaten again. Marking all of a day's planned entries eaten offers one Undo for every entry it changed, also when it took a second try.

Try again is offered only when the undo may not have landed: the device was offline, there was no answer, it timed out or it met a server fault. Trying again sends the same inverse. An undo the server refused, such as a restore after its ten minutes or an edit's undo on an entry another device removed, says why with no Try again, and the day is read again.

### Without a connection

Nothing is queued. A write the app knows it cannot send, because the device is offline, is not sent, and the screen says "You are offline. Changes need a connection.". A write that got no answer may have landed or not, so the screen says it could not confirm. Sending it again, by **Try again**, by **Log** or by pressing **+** again, sends the same request: a mark sets a state, so a second one changes nothing more, and an add carries the id it was sent with, so it applies once and answers "Already logged" when the first one landed.

An add that could not confirm reads its day and the recent items again at once, so an entry that landed shows on the Day tab with both totals, also when the user never presses again.

## How it works

### Writes

`apps/backend/src/services/writes/entries.ts` has `addEntry`, `updateEntry`, `setEntriesStatus`, `removeEntry`, `removeEntries` and `restoreEntry`, and `entryCopies.ts` beside it has `copyEntries`. Each runs in one transaction and answers the days it changed, read through `getDay` after the write. `addEntry` reads a new entry's basis from its source. `copyEntries` reads one only for an entry from a batch, from the batch's recipe, and `createCook` computes one for the entries a batch feeds, as [cooks in code](recipes.md#cooks-in-code) describes. No other write reads a basis. A PATCH of an estimate's figures replaces the estimate's own basis. `setEntriesStatus` answers the ids it changed, in day and position order, so an undo can change exactly those back. `removeEntries` answers the ids it removed in the same order. `copyEntries` copies every column of the source entry but its id and position, so a copy of an entry whose source is hidden still works, a hidden recipe's included. For an entry from a batch it drops the batch and reads one serving of the recipe through `readRecipeForEntry` with `includeDeleted`. Every removal and restore first purges removed entries past ten minutes and the batches nothing names any more, as [cooks in code](recipes.md#cooks-in-code) describes. A connected assistant logs, changes, marks, copies, removes and restores entries through these same services, each change recorded in the same transaction, as [what an assistant can change](connected-ai.md#what-an-assistant-can-change) describes. A screen write records nothing.

### Replays and restores

An add, a copy and a save-and-log carry an id the client chose. A repeat answers the first result with `outcome: "replayed"`, also when it arrives while the first is still being written. A copy answers `replayed` when it added no entry. An id another user holds answers 409 `entry_id_taken`.

`removeEntry` and `removeEntries` move each entry's whole row into `removed_entries` in the same transaction, written with `to_jsonb`. `restoreEntry` puts it back with `jsonb_populate_record`, so the id, position, basis, amount, references and status return exactly, and a hidden source restores too. A row older than ten minutes is not restored, and each remove and each restore clears the user's older rows. A stored row the `entries` table no longer takes, after a migration changed the table, answers `entry_not_found`. An add whose id is in `removed_entries` adds nothing and answers `replayed` with no entry.

### Locks and races

Every entry and saved meal write first takes the user's row `FOR KEY SHARE` through `lockUserForWrite` in `sourceValues.ts`, the lock the entry's foreign key takes anyway. Taking it first puts the user row before any source row, the order an account deletion locks in. It never waits behind a session or targets write. A write that races an account deletion waits for it, then answers 404 `user_not_found`, as a request with a deleted account's live access token does.

The status batch, the batch remove and the planned rewrite lock the entries they change in id order before they write them, so they never deadlock over the same entries. A deadlock anywhere answers 503 with `Retry-After`, as a lock wait that gave up does.

### Recent items in code

`listRecents` in `apps/backend/src/services/reads/log.ts` walks the user's eaten entries newest first down the index `entries_user_eaten_idx`, ordered by `eaten_at` and then position. Each step takes the next older entry of a food or meal the user can still log and has not met yet, and the walk stops at the limit. A long history costs little while the user keeps logging the same foods, because the walk reads only the entries newer than the last item it answers. When the user has fewer foods and meals they can log than the limit, the last step reads the rest of the history. The walk and the amounts and sources it answers are one statement, so they come from one snapshot. `lastAmountsOf` answers the last amount for a list of foods, for `getFood` and `listFavouriteFoods`. Both read the portion only through the rule a day's entries use: the entry's portion of the entry's food, visible to the user.

### Writes from the web app

`useEntryActions` in `apps/web/src/hooks/useEntryActions.ts` makes every entry write the web app sends, shows its toast and holds its undo. `undo(send, { goneIsDone, focusId, fromKeyboard })` runs an inverse. With `goneIsDone`, a 404 counts as undone, as for the `DELETE` that undoes an add.

- **The cache.** Each write puts the days it answered into the cache through `afterEntryWrite` in `apps/web/src/lib/invalidation.ts`, so a row and its day change with the answer and no extra read. An answered day whose `today` is older than the app's is read again.
- **Writes that overlap.** Every write runs through `counted`, which counts it against the dates it may answer with `beginEntryWrite`. When the last of two or more writes out at once on a date settles, that day is read again, so an older answer landing last never stands. A mark's undo counts against the date the mark was made on.
- **The time zone.** `counted` also takes `zoneEpoch` before it sends. An answer to a write sent before the account's time zone changed stays out of the cache, and its days are read again. [Today and the time zone](targets.md#today-and-the-time-zone) says why.
- **Holding.** While `useToday()` reports `holding`, a mark sends nothing, and a sheet's write answers `held` without sending. An undo never waits, because it names its ids and dates.
- **Marking many.** Mark all eaten sends 100 ids per request, one request after another. When a request fails, Try again sends that one and every one not yet sent, and its Undo covers the entries the earlier requests changed too.
- **Adds.** `useEntryActions.add` sends `POST /entries` with an id the app chose, counted against its date like every other write: a food, a saved meal or an estimate. Its answer puts the day into the cache, so the new row and both totals show with no read of the day. It does not show its own line: it answers `announce`, which the log sheet calls once it has slid out. Undo removes the entry, and a 404 counts as undone. The adds live in `useAddActions`, which `useEntryActions` composes.
- **An add that could not confirm.** No answer, a timeout or a server fault may hide an add that landed. The add first holds its pending id, then reads its day, the day ranges and the recent items again once (`afterAddUnconfirmed` in `apps/web/src/lib/invalidation.ts`), the saved meals too for a **Save and log**. An entry that landed shows on the Day tab with both totals at once. An add the app knew it could not send reads nothing, and a read that fails is not tried again.
- **Save and log.** `useEntryActions.saveAndLog` sends `POST /saved-meals/log` with the meal's and the entry's ids, made when the sheet opened, counted against the date like an add. Its days go into the cache the same way. Its line says "Saved Chicken bowl and logged 1 meal." with **Remove from day**, or "Saved Chicken bowl and added it to the plan." with **Remove from plan**, which removes the entry and keeps the meal. A repeat answers as a replay.
- **Pending ids.** A one-press add keeps its id in `apps/web/src/lib/pendingIds.ts` under the date, the kind and the food or meal. A second press after a timeout sends the same id, so the server adds one entry. The id is let go at the first of its answer, a read of a day that holds it, or a minute after it was made. After that a press makes a new id, so the same food logged again later is a second entry. For six seconds after an add could not confirm, as long as its line shows at most, the id is kept whatever happens. Pressing "+" again in that time answers "Already logged" for an add that landed, never a second entry. An `entry_id_taken` lets the id go at once, since that id can never succeed. A food's or a meal's log form makes its id as it opens and keeps it until a log is answered, or makes a new one after `entry_id_taken`.
- **Taking back an add.** `useEntryActions.withdrawAdd` removes an entry an unconfirmed add may have made, with no line. It answers whether it removed one: a 404 means nothing is there yet. The saved meal sheet uses it when a "Save and log" is pressed again with other figures, so [the new figures are logged](saved-meals.md#a-save-that-could-not-confirm).
- **Copies.** `useEntryActions.copy`, which lives in `useCopyActions` and which `useEntryActions` composes, sends `POST /entries/copy` with the ids the copy sheet chose, 100 at a time, each request counted against the target date. Its answered days go into the cache, so the target day shows its copies with no read. It then removes the ids the sheet sent earlier and did not send now with `POST /entries/remove`. When that fails, the copy still counts as done, and the days those ids went to are read again, so a copy that landed there shows. A source removed on another device answers `entry_not_found`, and the day shown is read again. Like an add, it answers `announce`, which the sheet calls once it has slid out, or as the copy answers when the sheet has left the page. Undo sends `POST /entries/remove` with every id the sheet sent. The ids belong to the copy sheet, one per date and entry for as long as it is open. The read after Cancel is `readDaysAgain`: the send's day, and each cached week that holds it. The same read follows Cancel after a send of more than 100 whose later request failed once an earlier one had landed, and a sheet that leaves the page with such a send behind it.
- **Replays.** An add the server already had answers it as replayed, and the line says so plainly: "Already logged Rahka." or "Rahka is already in the plan.", with Log another or Plan another, which adds it once more with a new id. A replayed add whose entry was removed since says "This was removed. Log another?". Log another from the line is a one-press write on the day: a failure says so in the line with Try again, which sends the same id.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`. Every write that can repeat answers 201 when it wrote and 200 when it repeated.

| Method | Path                   | Answers                                                                                                                                                                                                               |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/entries`             | 201 `{ entry, days, outcome }`. 200 on a repeat. 404 `food_not_found`, `saved_meal_not_found`, `recipe_not_found`, `portion_not_found`. 409 `entry_id_taken`. 400 `entry_eaten_in_future`, `recipe_serving_too_large` |
| PATCH  | `/entries/:id`         | 200 `{ entry, days, outcome }`, two days for a move. 404 `entry_not_found`, `portion_not_found`. 400 `entry_kind_mismatch`, `entry_eaten_in_future`                                                                   |
| POST   | `/entries/status`      | 200 `{ changedIds, days }`. Takes `{ entryIds, status }`, 1 to 100 ids                                                                                                                                                |
| POST   | `/entries/copy`        | 201 `{ entries, days, outcome }`, 200 when it added none. Takes `{ toDate, entries: [{ sourceId, id }] }`, 1 to 100. 404 `entry_not_found`. 409 `entry_id_taken`                                                      |
| POST   | `/entries/remove`      | 200 `{ removedIds, days }`, empty lists when nothing was left to remove. Takes `{ entryIds }`, 1 to 100 distinct ids. 400 `invalid_request`                                                                           |
| DELETE | `/entries/:id`         | 200 `{ days }`. 404 `entry_not_found`                                                                                                                                                                                 |
| POST   | `/entries/:id/restore` | 201 `{ entry, days, outcome }`, 200 when it is already back. 404 `entry_not_found`                                                                                                                                    |
| GET    | `/log/recents?limit=`  | 200 `{ items }`. `limit` 1 to 30, 12 by default. Else 400 `invalid_request`                                                                                                                                           |

Every entry write also answers 404 `user_not_found` when it races an account deletion, and 503 with `Retry-After` on a deadlock or a lock wait that gave up.

An add takes `kind` with `id`, `date` and `status`: `food` with `foodId` and `amount` (`{ grams }` or `{ portionId, count }`), `saved_meal` with `savedMealId` and `count`, `recipe` with `recipeId` and `servings`, or `estimate` with `name`, `figures` and `note`. A PATCH takes `date`, `status`, `amount`, `count`, `servings`, `name`, `figures` or `note`, at least one, and a field the entry's kind does not have answers `entry_kind_mismatch`. A refused value answers `entry_grams_invalid`, `entry_count_invalid`, `figure_required`, `figure_invalid`, `name_required`, `name_too_long` or `note_too_long`. A portion count whose weight is zero or over 5000 g answers `entry_grams_invalid`. An entry is the one a [day](days.md#api) holds. The write answers are in `packages/types/src/results.ts`.

A recent item is `{ kind: "food", food, last }` with a food summary and a last amount `{ grams, portion }`, or `{ kind: "saved_meal", meal, last: { count } }`. A portion is `{ id, unit, name, count }`. `GET /foods/:id` answers `lastAmount`, and `GET /foods/favourites` answers each favourite with its `lastAmount`. The shapes are in `packages/types/src/log.ts` and `foods.ts`.

### Data

- `removed_entries`: a removed entry's id, `user_id`, its whole row as `row` and `removed_at`. It cascades from `users`.

### Known gaps

- A Mark all eaten that fails partway, with its failure toast dismissed, leaves the entries its earlier requests marked with no Undo.

Requirements: FR-DAY-05, FR-DAY-10, FR-DAY-11, FR-DAY-12, FR-LOG-01, FR-LOG-02, FR-LOG-03, FR-LOG-04, FR-LOG-05 (requirements 3.3 and 3.4)

## Where it appears

- [The Day tab](../app/day.md): marking one entry or all of a day's planned entries eaten, editing, moving and removing an entry in the entry sheet, and copying entries to another day in [the copy sheet](../app/day.md#the-copy-sheet), each with Undo.
- [The log sheet](../app/log-sheet.md): adding a food, a saved meal or an estimate to a day, saving a new meal and logging it in one action, the recent items, and logging an item again in one press, each with Undo.
