# Saved meals

A saved meal is a meal the user eats again and again, such as a delivered lunch, saved once with its name, where it comes from and its figures for one meal. It is logged by count without retyping anything.

## In detail

### A saved meal

A saved meal has a name of at most 120 characters, an optional source of at most 40, and its energy, protein, carbohydrates and fat for one meal, copied from a label or a menu. All four figures are required. Energy runs from 0 to 10000 kcal and each macro from 0 to 1000 g, with one decimal.

The source says where the meal comes from, such as a delivery service. It is one free-text tag, and a blank one is none. Only its owner sees a saved meal.

A saved meal is logged to any day as a count of meals, such as 1 or 2.5. 2.5 meals of 60 kcal and 8 g of protein are 150 kcal and 20.0 g. A saved meal carries [its last count](quick-logging.md#recent-items-and-the-last-amount).

Saved meals are listed in Finnish alphabetical order, where å, ä and ö come after z.

### Saving and logging a meal

[The log sheet](../app/log-sheet.md) logs saved meals, and [the Library](../app/recipes.md) keeps them. In the log sheet a new meal is saved and logged in one action, so a delivered lunch typed in once is in the day and in the saved meals. It can also be saved without logging there. The Library has no day, so a new meal there is saved only. One press on a meal's **+** logs it again with its last count, or one meal when it was never eaten. Opened, a meal logs any number of meals, eaten or planned.

An edit changes the meal everywhere it is listed. Its planned entries from today on take the new figures, and every other entry keeps [the figures it was added with](days.md#figures-that-stay).

### Finding a meal by its source

The source is how a user who orders from several services finds a meal. A meal matches a search when every typed word is part of its name or its source, whatever the case and the accents. When the meals name two sources or more, a chip per source keeps that source's meals alone, in the list and in the search results. A chosen source holds only while its chips show: once the meals name fewer than two sources, or none names the chosen one any more, every meal shows again.

### A save that could not confirm

A new meal keeps its id, and the id of its first entry, from the moment its form opens, so pressing again after a save that could not confirm makes one meal and one entry. When the form changed in between, the latest press decides what is saved and logged:

- The meal is saved as the form now reads. When the earlier press never reached the server, the press goes on as the first one would have.
- An entry the earlier **Save and log** may have added goes when the press now asks for other figures, the other state, or no log at all. The press then logs a new entry, with the figures on screen.
- When that entry is not there yet, the press logs under the same entry id. An earlier press still on its way that lands later then repeats this one, so the day holds one entry.
- A new name or source alone keeps that entry, since an entry shows its meal's name as it is now.
- Pressed again with nothing changed, the same request is sent, and an entry that landed is reported as already logged.

A **Save and log** that could not confirm is [an add that could not confirm](quick-logging.md#without-a-connection), and the saved meals are read again with its day, so a meal and an entry that landed show at once.

### Archiving and deleting

Archiving a saved meal moves it from the list to the archived list. An archived meal can still be logged, and it can be restored to the list. An archived meal is left out of [recent items](quick-logging.md#recent-items-and-the-last-amount).

A saved meal can be edited and deleted. Editing or deleting one that days use follows the rules for figures that stay. Days it was logged on keep their figures after a delete.

The meal's edit sheet has **Delete** in its footer wherever it opens, and it asks first. In the log sheet the meal view has **Delete meal** too. Both run one delete. A meal already deleted on another device counts as deleted. In the Library the edit sheet also has **Archive meal**, or **Restore meal** for an archived one, at the end of its form. The button turns in place, and a failure shows on the sheet's error line. In the log sheet the meal view archives instead.

## How it works

### Filtering in code

The web app reads the list once and filters it on the device (`apps/web/src/components/log/mealFilter.ts`), so the meals follow every key. Case and accents are folded before the words are compared. The API answers the whole list and filters nothing.

### Services

`apps/backend/src/services/reads/savedMeals.ts` has `listSavedMeals` and `getSavedMeal`. `apps/backend/src/services/writes/savedMeals.ts` has `createSavedMeal`, `updateSavedMeal`, `setSavedMealArchived`, `deleteSavedMeal` and `saveAndLog`, which runs `createSavedMeal` then `addEntry` in one transaction. A create carries an id the app chose, so a repeat answers the meal again, also one that arrives while the first is still being written. Its insert skips a conflict on either of the meal's unique keys, the id and the id with the user. The list sorts with `byName`, the `fi-x-icu` order own foods use. The list answers all of the user's active or archived meals at once, with no search or source filter on the server. Another user's meal, and a deleted one, answers 404 `saved_meal_not_found` on every route. A repeated create answers the first meal and ignores the body. Archiving is one update of the meal's own row and takes no user lock. Every other write takes [the user lock](quick-logging.md#locks-and-races) first. A connected assistant saves, edits and archives meals through these same services, each change recorded in the same transaction, as [what an assistant can change](connected-ai.md#what-an-assistant-can-change) describes. It cannot delete one.

### Writes from the web app

The log sheet and the Library send every saved meal write, through the same sheet and the same helpers. While the app asks the server for today, a write waits, as on the Day tab. Each puts its own answer into the cached lists and the recent items in place first, through `apps/web/src/lib/mealCache.ts`, so no row moves under the thumb, then reads again what only the server knows, through the functions in `apps/web/src/lib/invalidation.ts`.

- **Save and log** sends `POST /saved-meals/log`, and **Save meal** `POST /saved-meals`, each with the ids made as the sheet opened. Save and log is [an add](quick-logging.md#writes-from-the-web-app): its day goes into the cache from the answer. The saved meals are then read again, for the new meal's place in the Finnish order. A **Save meal** that could not confirm reads the saved meals again.
- **Pressed again after a save that could not confirm**, with the form changed, the sheet first brings what the earlier send may have written up to date (`apps/web/src/components/log/mealSends.ts`). It sends `PUT /saved-meals/:id` when the meal changed, where a 404 means nothing landed, since the meal and its entry are one transaction. It sends `DELETE /entries/:id`, through `withdrawAdd`, when an entry from an earlier Save and log would keep figures or a state the press no longer asks for. The entry takes a new id only when the `DELETE` removed one. A 404 keeps the id, so an earlier request that lands after the press replays it. Then the press itself is sent.
- **An edit** sends `PUT /saved-meals/:id`. Its answer replaces the meal's row in place in both lists and the recent items. Then the lists, the days and the recent items are read again, since its planned entries from today on take the new figures.
- **Archive and restore** send `PUT` and `DELETE /saved-meals/:id/archived`. The meal leaves the list it was in, in place, and the lists and the recent items are read again. On the edit sheet, **Save meal** and **Delete** wait while an archive or a restore from that sheet runs, so a save or a delete never crosses it.
- **A delete** sends `DELETE /saved-meals/:id`, from `apps/web/src/components/log/useSavedMealDelete.ts`. A 404 counts as deleted. A deleted meal, and a meal found gone, leaves both lists and the recent items in place. Then the lists, the days and the recent items are read again.

### API

All under `/api/v1`, all Bearer. A refused request answers `{ message, code }`.

| Method      | Path                        | Answers                                                                                                                                                                                                                             |
| ----------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET         | `/saved-meals?archived=`    | 200 `{ meals }`, the active ones, or the archived ones with `archived=true`                                                                                                                                                         |
| GET         | `/saved-meals/:id`          | 200 with the meal, archived or not. 404 `saved_meal_not_found`                                                                                                                                                                      |
| POST        | `/saved-meals`              | 201 with the meal, 200 on a repeat. Takes `{ id, name, source, figures }`. 409 `saved_meal_id_taken`                                                                                                                                |
| POST        | `/saved-meals/log`          | 201 `{ meal, entry, days, outcome }`. Takes `{ meal, entry: { id, date, status, count } }`. A repeat answers 200, with no entry when it was removed since. 409 `saved_meal_id_taken`, `entry_id_taken`. 400 `entry_eaten_in_future` |
| PUT         | `/saved-meals/:id`          | 200 with the meal. Takes `{ name, source, figures }`. 404                                                                                                                                                                           |
| PUT, DELETE | `/saved-meals/:id/archived` | 204, archives or restores, also when it already is. 404                                                                                                                                                                             |
| DELETE      | `/saved-meals/:id`          | 204. 404                                                                                                                                                                                                                            |

A meal has `id`, `name`, `source`, `figures`, `archived` and `lastCount`. A refused meal answers `name_required`, `name_too_long`, `meal_source_too_long`, `figure_required` or `figure_invalid`. The shapes are in `packages/types/src/savedMeals.ts`.

### Data

- `saved_meals`: `user_id` cascading from `users`, `name`, `source`, the four figures per meal with one decimal, `archived_at` and `deleted_at`. The unique constraint `saved_meals_id_user_uq` on `(id, user_id)` is what an entry's meal key points at.

### Known gaps

- A first Save and log that reaches the server only after a second press's `PUT` answered 404, and before that press's own request, is replayed by it: the meal and its entry keep the old figures once.

Requirements: FR-MEAL-01 to FR-MEAL-04 (requirements 3.6)

## Where it appears

- [The log sheet](../app/log-sheet.md): the saved meals while browsing and in the results, with their source chips, each logged again in one press or opened to log a number of meals. A new meal saved alone or saved and logged in one request, an edit, archiving, restoring and deleting, and the archived meals.
- [The Library](../app/recipes.md): the Meals segment, with the saved meals and the archived meals in one list each, a search over their names and sources, a new meal saved without logging, and an edit, archiving, restoring and deleting from the meal's edit sheet.
