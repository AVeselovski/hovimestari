# Saved meals

A saved meal is a meal the user eats again and again, such as a delivered lunch, saved once with its name, where it comes from and its figures for one meal. It is logged by count without retyping anything.

## In detail

### A saved meal

A saved meal has a name of at most 120 characters, an optional source of at most 40, and its energy, protein, carbohydrates and fat for one meal, copied from a label or a menu. All four figures are required. Energy runs from 0 to 10000 kcal and each macro from 0 to 1000 g, with one decimal.

The source says where the meal comes from, such as a delivery service. It is one free-text tag, and a blank one is none. Only its owner sees a saved meal.

A saved meal is logged to any day as a count of meals, such as 1 or 2.5. 2.5 meals of 60 kcal and 8 g of protein are 150 kcal and 20.0 g. Creating a meal and logging it can be one action. A saved meal carries [its last count](quick-logging.md#recent-items-and-the-last-amount).

Saved meals are listed in Finnish alphabetical order, where å, ä and ö come after z.

### Archiving and deleting

Archiving a saved meal moves it from the list to the archived list. An archived meal can still be logged, and it can be restored to the list.

A saved meal can be edited and deleted. Editing or deleting one that days use follows [the rules for figures that stay](days.md#figures-that-stay).

## How it works

### Services

`apps/backend/src/services/reads/savedMeals.ts` has `listSavedMeals` and `getSavedMeal`. `apps/backend/src/services/writes/savedMeals.ts` has `createSavedMeal`, `updateSavedMeal`, `setSavedMealArchived`, `deleteSavedMeal` and `saveAndLog`, which runs `createSavedMeal` then `addEntry` in one transaction. A create carries an id the app chose, so a repeat answers the meal again, also one that arrives while the first is still being written. Its insert skips a conflict on either of the meal's unique keys, the id and the id with the user. The list sorts with `byName`, the `fi-x-icu` order own foods use. The list answers all of the user's active or archived meals at once, with no search or source filter on the server. Another user's meal, and a deleted one, answers 404 `saved_meal_not_found` on every route. Archiving is one update of the meal's own row and takes no user lock. Every other write takes [the user lock](quick-logging.md#locks-and-races) first.

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

- The assistant's tools for saved meals arrive with the connected AI step. Until then only the API reaches these services.

Requirements: FR-MEAL-01 to FR-MEAL-04 (requirements 3.6)

## Where it appears

- The web app has no saved meal screens yet. The API is reached directly.
