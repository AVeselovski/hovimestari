# Quick logging

Quick logging is how entries reach a [day](days.md#a-day-and-its-entries) and change there: adding, editing, moving, marking eaten, copying, removing and restoring, each with an undo. Recent items offer the foods and meals the user ate lately, with the amount of the last time, to log again in one action.

## In detail

### Adding and changing an entry

An entry is added to a date, planned or eaten. An eaten entry on a future date is refused. A food entry takes grams or a count of a portion. A [saved meal](saved-meals.md#a-saved-meal) entry takes a count of meals. An [estimate](days.md#estimates) takes its name, figures and note. A portion count whose weight rounds to zero or comes to more than 5000 g is refused.

An entry's amount can be changed later: the grams or portion count of a food entry, the count of a saved meal entry, and the name, figures and note of an estimate. A changed portion count is weighed at the portion's grams today. Every change keeps [the figures the entry was added with](days.md#figures-that-stay).

Moving an entry changes its date and keeps its place in the order. Moving an eaten entry to a future date makes it planned, unless the move says eaten, which a future date refuses. A move can also mark the entry eaten or planned.

### Marking eaten

[Planned and eaten](days.md#planned-and-eaten) entries can be marked either way, one at a time or up to 100 at once, such as everything planned on a day. Marking several entries changes the ones that are still there and skips the rest, so an entry removed on another device never blocks the others. Marking eaten skips an entry dated in the future. Each mark eaten records the time of that mark.

### Copying entries

Copying entries to another day adds them there as planned, with the figures of the entries they copy, in their original order. Up to 100 entries copy at once. A day whose saved meal was deleted since copies too. Each copy carries its own new id, and no two ids in a request may match. A source may repeat, so one request can add the same entry to the day several times.

### Recent items and the last amount

Recent items are the foods and saved meals the user ate most recently, newest first, each once. Twelve by default and 30 at most. Only eaten entries count: what the user planned and never ate is not recent. An estimate is never a recent item.

Each recent item carries the amount of its latest eaten entry: the grams of a food, and the portion and count when it was typed as a portion, or the count of a saved meal. An amount changed while marking an entry eaten is the one remembered. A food's detail and each [favourite](foods.md#favourites) carry the same last amount, or none for a food the user never ate. A saved meal carries the count of its latest eaten entry.

A food the user can no longer see, and an archived or deleted saved meal, is left out. A retired Fineli food stays. When the portion of a last amount was removed, the amount keeps its grams and its label, and its portion id is null, so the grams are what is offered.

### Logging again

Logging a recent item again adds an entry with its last amount. It is an ordinary entry, and takes the food's or the meal's values as they are now. The request names the date and whether the entry is planned or eaten.

### A request sent twice

Each add, copy, new saved meal and save-and-log carries an id the app chose for it. Sent twice, for example after a timeout on a weak signal, it adds one entry or one meal and answers the first one again, saying it was already logged. That holds also when the two arrive at the same moment. A copy sent twice adds each entry once and answers the second with the same entries.

### Undo

Every logging action has an inverse:

- An add is undone by removing the entry.
- Marking entries eaten is undone by marking exactly the entries it changed as planned.
- A remove is undone by a restore, within ten minutes. The entry comes back exactly as it was, with its place in the day and its figures, even when its food or meal was deleted since.
- A move is undone by moving back, eaten again when the move made it planned.

A restore is exact. The other inverses bring back the entry's date, status, amount and figures, but not when it was eaten. Marking an entry eaten again, after it was eaten and then planned, records the time of that mark. The entry then counts as eaten most recently, so it moves to the front of recent items, and its amount becomes the last amount.

After an add was undone, sending the same add again adds nothing, so a late retry cannot bring back an entry the user undid.

An amount entered as a count of a portion is undone as that count, weighed at the portion's grams at the time of the undo. When the portion was edited in between, the grams differ from before. When the portion is gone, the amount is undone in grams.

On screen, every mark, save and removal offers Undo for six seconds. Undo sends the inverse of exactly what changed: the ids a mark changed, a restore after a remove, and every field an edit changed, read from the entry before and the entry the server answered, so a move that planned an eaten entry is undone eaten again. Marking all of a day's planned entries eaten offers one Undo for every entry it changed, also when it took a second try.

Try again is offered only when the undo may not have landed: the device was offline, there was no answer, it timed out or it met a server fault. Trying again sends the same inverse. An undo the server refused, such as a restore after its ten minutes or an edit's undo on an entry another device removed, says why with no Try again, and the day is read again.

### Without a connection

Nothing is queued. A write the app knows it cannot send, because the device is offline, is not sent, and the screen says "You are offline. Changes need a connection.". A write that got no answer may have landed or not, so the screen says it could not confirm and offers to try again. Trying again sends the same request: a mark sets a state, so a second one changes nothing more, and an add carries the id it was sent with, so it applies once.

## How it works

### Writes

`apps/backend/src/services/writes/entries.ts` has `addEntry`, `updateEntry`, `setEntriesStatus`, `copyEntries`, `removeEntry` and `restoreEntry`. Each runs in one transaction and answers the days it changed, read through `getDay` after the write. `addEntry` is the only write that reads a basis from a source. A PATCH of an estimate's figures replaces the estimate's own basis. `setEntriesStatus` answers the ids it changed, in day and position order, so an undo can change exactly those back. `copyEntries` copies every column of the source entry but its id and position, so a copy of an entry whose source is hidden still works.

### Replays and restores

An add, a copy and a save-and-log carry an id the client chose. A repeat answers the first result with `outcome: "replayed"`, also when it arrives while the first is still being written. A copy answers `replayed` when it added no entry. An id another user holds answers 409 `entry_id_taken`.

`removeEntry` moves the entry's whole row into `removed_entries` in the same transaction, written with `to_jsonb`. `restoreEntry` puts it back with `jsonb_populate_record`, so the id, position, basis, amount, references and status return exactly, and a hidden source restores too. A row older than ten minutes is not restored, and each remove and each restore clears the user's older rows. A stored row the `entries` table no longer takes, after a migration changed the table, answers `entry_not_found`. An add whose id is in `removed_entries` adds nothing and answers `replayed` with no entry.

### Locks and races

Every entry and saved meal write first takes the user's row `FOR KEY SHARE` through `lockUserForWrite` in `sourceValues.ts`, the lock the entry's foreign key takes anyway. Taking it first puts the user row before any source row, the order an account deletion locks in. It never waits behind a session or targets write. A write that races an account deletion waits for it, then answers 404 `user_not_found`, as a request with a deleted account's live access token does.

The status batch and the planned rewrite lock the entries they change in id order before they update them, so the two never deadlock over the same entries. A deadlock anywhere answers 503 with `Retry-After`, as a lock wait that gave up does.

### Recent items in code

`listRecents` in `apps/backend/src/services/reads/log.ts` walks the user's eaten entries newest first down the index `entries_user_eaten_idx`, ordered by `eaten_at` and then position. Each step takes the next older entry of a food or meal the user can still log and has not met yet, and the walk stops at the limit. A long history costs little while the user keeps logging the same foods, because the walk reads only the entries newer than the last item it answers. When the user has fewer foods and meals they can log than the limit, the last step reads the rest of the history. The walk and the amounts and sources it answers are one statement, so they come from one snapshot. `lastAmountsOf` answers the last amount for a list of foods, for `getFood` and `listFavouriteFoods`. Both read the portion only through the rule a day's entries use: the entry's portion of the entry's food, visible to the user.

### Writes from the web app

`useEntryActions` in `apps/web/src/hooks/useEntryActions.ts` makes every entry write the web app sends, shows its toast and holds its undo. `undo(send, { goneIsDone, focusId, fromKeyboard })` runs an inverse. With `goneIsDone`, a 404 counts as undone, as for the `DELETE` that undoes an add.

- **The cache.** Each write puts the days it answered into the cache through `afterEntryWrite` in `apps/web/src/lib/invalidation.ts`, so a row and its day change with the answer and no extra read. An answered day whose `today` is older than the app's is read again.
- **Writes that overlap.** Every write runs through `counted`, which counts it against the dates it may answer with `beginEntryWrite`. When the last of two or more writes out at once on a date settles, that day is read again, so an older answer landing last never stands. A mark's undo counts against the date the mark was made on.
- **The time zone.** `counted` also takes `zoneEpoch` before it sends. An answer to a write sent before the account's time zone changed stays out of the cache, and its days are read again. [Today and the time zone](targets.md#today-and-the-time-zone) says why.
- **Holding.** While `useToday()` reports `holding`, a mark sends nothing, and a sheet's write answers `held` without sending. An undo never waits, because it names its ids and dates.
- **Marking many.** Mark all eaten sends 100 ids per request, one request after another. When a request fails, Try again sends that one and every one not yet sent, and its Undo covers the entries the earlier requests changed too.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`. Every write that can repeat answers 201 when it wrote and 200 when it repeated.

| Method | Path                   | Answers                                                                                                                                                               |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/entries`             | 201 `{ entry, days, outcome }`. 200 on a repeat. 404 `food_not_found`, `saved_meal_not_found`, `portion_not_found`. 409 `entry_id_taken`. 400 `entry_eaten_in_future` |
| PATCH  | `/entries/:id`         | 200 `{ entry, days, outcome }`, two days for a move. 404 `entry_not_found`, `portion_not_found`. 400 `entry_kind_mismatch`, `entry_eaten_in_future`                   |
| POST   | `/entries/status`      | 200 `{ changedIds, days }`. Takes `{ entryIds, status }`, 1 to 100 ids                                                                                                |
| POST   | `/entries/copy`        | 201 `{ entries, days, outcome }`, 200 when it added none. Takes `{ toDate, entries: [{ sourceId, id }] }`, 1 to 100. 404 `entry_not_found`. 409 `entry_id_taken`      |
| DELETE | `/entries/:id`         | 200 `{ days }`. 404 `entry_not_found`                                                                                                                                 |
| POST   | `/entries/:id/restore` | 201 `{ entry, days, outcome }`, 200 when it is already back. 404 `entry_not_found`                                                                                    |
| GET    | `/log/recents?limit=`  | 200 `{ items }`. `limit` 1 to 30, 12 by default. Else 400 `invalid_request`                                                                                           |

Every entry write also answers 404 `user_not_found` when it races an account deletion, and 503 with `Retry-After` on a deadlock or a lock wait that gave up.

An add takes `kind` with `id`, `date` and `status`: `food` with `foodId` and `amount` (`{ grams }` or `{ portionId, count }`), `saved_meal` with `savedMealId` and `count`, or `estimate` with `name`, `figures` and `note`. A PATCH takes `date`, `status`, `amount`, `count`, `name`, `figures` or `note`, at least one, and a field the entry's kind does not have answers `entry_kind_mismatch`. A refused value answers `entry_grams_invalid`, `entry_count_invalid`, `figure_required`, `figure_invalid`, `name_required`, `name_too_long` or `note_too_long`. A portion count whose weight is zero or over 5000 g answers `entry_grams_invalid`. An entry is the one a [day](days.md#api) holds. The write answers are in `packages/types/src/results.ts`.

A recent item is `{ kind: "food", food, last }` with a food summary and a last amount `{ grams, portion }`, or `{ kind: "saved_meal", meal, last: { count } }`. A portion is `{ id, unit, name, count }`. `GET /foods/:id` answers `lastAmount`, and `GET /foods/favourites` answers each favourite with its `lastAmount`. The shapes are in `packages/types/src/log.ts` and `foods.ts`.

### Data

- `removed_entries`: a removed entry's id, `user_id`, its whole row as `row` and `removed_at`. It cascades from `users`.

### Known gaps

- The assistant's tools for logging arrive with the connected AI step. Until then only the API reaches these services.
- Adding entries, copying them and recent items have no screen. Only the API reaches them.
- A Mark all eaten that fails partway, with its failure toast dismissed, leaves the entries its earlier requests marked with no Undo.

Requirements: FR-DAY-05, FR-DAY-11, FR-DAY-12, FR-LOG-02 (amounts only), FR-LOG-03 to FR-LOG-05 (requirements 3.3 and 3.4)

## Where it appears

- [The Day tab](../app/day.md): marking one entry or all of a day's planned entries eaten, editing, moving and removing an entry in the entry sheet, each with Undo.
