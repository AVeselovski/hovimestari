# Design: saved meals and own foods on the Recipes tab

Status: in review, round 1 and the delta review answered
Branch: `feat/recipes-tab-foods-and-meals` (cut from `origin/master` once week-and-copy has merged)
Requested by: Artur, 2026-11-18, after a day of real use: "custom meals and foods could use a page (view) of their own, instead of being hidden behind log function for easier CRUD access". Order and name confirmed the same day: this comes after the week view and the copy sheet, the tab keeps the name "Recipes".

**Verdict: build.** Nothing needs a product decision first. The page reuses the existing sheets, queries and services. The server needs no change.

## 0. Product decisions the owner may want to shelve

| #   | Fork                                                                                                                     | Recommendation, and why                                                                                                                                                                                                                                                                                                                              | Cost if flipped                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | A row on this page opens its edit sheet directly, or opens a view first (as the log sheet does)                          | **Edit sheet directly.** The page is for keeping things. The log sheet is for logging, and it keeps its food and meal views, with portions, the star and the log block.                                                                                                                                                                              | A view stack on the page: a second copy of the log sheet's navigation. Large                                              |
| 0.2 | "+" one-tap logging on this page's rows, or none                                                                         | **None.** Logging belongs to the log sheet, which knows its day. A "+" here would need a day the page does not have.                                                                                                                                                                                                                                 | Rows take `AgainButton` and a day (today). Small, but it blurs the two surfaces                                           |
| 0.3 | Marking a favourite on this page, or only reading the star                                                               | **Read only.** A favourite's star shows on its row, as in every food list. Marking stays in the food view. Artur parked "a star in the entry sheet" earlier, so this does not widen the favourite surface either.                                                                                                                                    | A `FavouriteButton` as the row's `trailing`. Small                                                                        |
| 0.4 | A filter field on the page from the start, or not                                                                        | **Not yet.** Both lists are in name order and Artur has a handful of each. The log sheet's search already finds both by name.                                                                                                                                                                                                                        | One `SearchField` over both lists filtering on the device with `mealFilter` and the same fold for foods. About half a day |
| 0.5 | Where a meal is archived and deleted from this page                                                                      | **In its edit sheet.** **Delete** sits in the sheet's footer on every host, as it does in the own-food sheet. **Archive meal** (or **Restore meal**) sits at the end of the edit form when the host passes `archive`, which only this page does, because the log sheet already has its meal view for it. A deliberate trade-off, stated in section g | Leave both out, and the page cannot archive or delete a meal. Small either way                                            |
| 0.6 | Defect found in passing: `getOwnFoods` sends no `limit`, so every list of own foods stops at the server's default of 100 | Fixed here: the one query asks for 200, the most the route answers (`apps/web/src/lib/api/foods.ts:17-20`, `apps/backend/src/routes/foods.ts:39`)                                                                                                                                                                                                    | None. Past 200 is a known gap, filed in TODO                                                                              |

## 1. Requirements validation

| Requirement            | How this design meets it                                                                                                                               | Note                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| FR-FOOD-04, FR-FOOD-05 | Add, edit and delete own foods from the page through `OwnFoodSheet`, the same sheet and service as the log sheet                                       |                                                                           |
| FR-FOOD-06             | Portions stay in the log sheet's food view                                                                                                             | Not on this page (0.1)                                                    |
| FR-FOOD-08             | The star shows on a favourite's row                                                                                                                    | Marking stays in the food view (0.3)                                      |
| FR-MEAL-01, FR-MEAL-03 | New, edit, archive, restore, delete from the page through `SavedMealSheet` and `useMealActions`                                                        | A new meal here is saved without logging, since the page has no day       |
| FR-MEAL-02             | Logging stays in the log sheet                                                                                                                         |                                                                           |
| FR-MEAL-04             | Each meal row shows its source. No source chips on this page                                                                                           | Follows 0.4                                                               |
| FR-DAY-07              | Delete runs the existing services, which hide a used food or meal and keep every entry's figures (`apps/backend/src/services/writes/foods.ts:128-150`) | Already pinned by `routes/__tests__/figuresStay.db.test.ts:75` and `:161` |
| NFR-UX-02, NFR-UX-05   | Phone-first single column. Sheets are the existing Base UI wrappers                                                                                    |                                                                           |
| NFR-AI-03              | No new service, so no new tool. See section d                                                                                                          |                                                                           |

**The problem, stripped of the proposed mechanism:** managing saved meals and own foods takes a detour through logging. To fix a typo in a meal, a person opens the log sheet for a day, finds the meal, opens it and presses Edit meal. Nothing on screen says the foods and meals are a collection the person keeps.

**Does a page on the second tab solve it without workarounds?** Yes. Checked against the forced-workaround test:

- **One implementation of each sheet.** The two sheets the page mounts, `OwnFoodSheet` and `SavedMealSheet`, are already self-contained: each takes its target by props and does its own cache write (`OwnFoodSheet.tsx:167` calls `afterOwnFoodSaved`, `SavedMealSheet.tsx` calls `afterSavedMealChange` and `afterSavedMealCreated`). `FoodSheetStack` (`apps/web/src/components/foods/FoodSheetStack.tsx:73-144`) is only the log sheet's mount slot. The page mounts the same components in its own tree. That is reuse of a component, not a second copy of a control.
- **One forced change.** `SavedMealSheet` requires a day and the entry actions (`SavedMealSheet.tsx:69-80`), because a new meal can be saved and logged in one press. The page has no day, so the logging props become one optional `logging` prop. Without it the sheet is "save only": no Eaten or planned, no Save and log, and **Save meal** is the primary button. That is a real mode, not a workaround: the sheet already has a save-only path.
- **One stated trade-off.** The page sends a row straight to its edit form (0.1), so archiving needs a home in that form. `archive` is a prop only this page passes, because the log sheet's meal view already archives (`useMealActions.ts:13-16`). One smell, accepted on purpose: moving archive out of the meal view would change a log sheet flow Artur already uses, for no gain there. Delete is not a variant: it moves into the sheet for every host, as the own-food sheet's does.
- **One query per list, one invalidation per write.** The page reads `ownFoodsQuery()` and `savedMealsQuery(false | true)` (`apps/web/src/lib/queryOptions.ts:86-91`, `135-140`), the keys the log sheet reads. Every write already patches those keys through `foodCache.ts` and `mealCache.ts`. The two places cannot disagree, because there is one copy of the data.
- **No held-list state to defend.** The log sheet is mounted only on the Day tab, inside `DayLauncher` (`apps/web/src/components/day/DayTab.tsx:198`), and gets a fresh mount on every open. While the Recipes tab shows, no `HeldLists` is mounted, so there is nothing to release. The next open of the log sheet starts from the cache, with the page's writes in it (`heldList.tsx:28-30`). The reverse holds too: the page mounts on navigation and reads the cache the log sheet wrote. A `releaseHeldLists` call made by a sheet on this page bumps a counter that the next `HeldLists` mount reads as its starting value (`heldList.tsx:183-186`), so it changes nothing.
- **The tab's name.** "Recipes" holds no recipe yet. Artur chose to keep it. The page's two section headings say what it holds, and the page promises nothing about recipes. When recipes arrive they are the first section.

**Changes proposed that were not asked for:** 0.5 (archive in the meal's edit sheet on this page, and Delete in that sheet everywhere), 0.6 (the 200 limit) and one shared delete for the own-food pair. All three are in section h.

**Requirements drift:** none. `TODO.md` has "Saved meals live in the log sheet ... The alternative is a list page. Who decides: Artur, once he has used the log sheet." He has decided. This change deletes that item.

## a) Overview

The Recipes tab today renders `EmptyTab`, "Nothing here yet." (`apps/web/src/app/(app)/recipes/page.tsx:11-13`, `apps/web/src/components/shell/EmptyTab.tsx:9-16`). It becomes the place where a person keeps their saved meals and their own foods: one row of two add buttons at the top, then two lists in name order, each row opening its edit sheet, archived meals under the meals. It reuses the log sheet's rows and sheets and reads the same cached lists, so an edit in either place shows in the other.

## b) Components and responsibilities

| Component                                               | Change   | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Depends on                                                               |
| ------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/web/src/app/(app)/recipes/page.tsx`               | modified | Renders `RecipesTab` in place of `EmptyTab`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |                                                                          |
| `apps/web/src/components/recipes/RecipesTab.tsx`        | new      | The page: `PageContainer`, the action row (**New saved meal**, **Add a food**), the two sections, the sheet targets (`useSheetTarget` for own food and meal), `sources` from `sourcesOf(savedMealsQuery(false))` as `FoodSheet.tsx:135` does, and `held` from `useToday().holding` for `useMealActions` and `SavedMealSheet`                                                                                                                                                                                                       | `useSheetTarget`, `useMealActions`, `sourcesOf`, `useToday`              |
| `apps/web/src/components/recipes/SavedMealsSection.tsx` | new      | The heading, the active meals as `SavedMealRow`s (no `trailing`), its empty and unreadable lines, **Archived meals** and the inline archived list                                                                                                                                                                                                                                                                                                                                                                                  | `savedMealsQuery`, `SavedMealRow`, `useMealFigures`, `ArchivedMealsView` |
| `apps/web/src/components/recipes/OwnFoodsSection.tsx`   | new      | The heading, the own foods as `FoodRow`s (no `trailing`, no "Yours" mark), its empty and unreadable lines                                                                                                                                                                                                                                                                                                                                                                                                                          | `ownFoodsQuery`, `FoodRow`, `foodDetailQuery`                            |
| `apps/web/src/components/log/SavedMealSheet.tsx`        | modified | `date`, `actions`, `onLogged` move into one optional `logging` prop. Absent: save only. Edit mode owns its delete: `useSavedMealDelete` in the sheet, the dialog in `sheet.stacked`, **Delete** as `footerStart`. On confirm the sheet closes itself, then calls `onDeleted(id)`, as `OwnFoodSheet.tsx:112-121` and `:186` do. New optional `archive` prop (`{ archived, busy, toggle }`): **Archive meal** or **Restore meal** at the end of the form, a failure on the sheet's `formError` line. New optional `focusAfterDelete` | `useSavedMealDelete`                                                     |
| `apps/web/src/components/foods/OwnFoodSheet.tsx`        | modified | New optional `focusAfterDelete`, used as the delete's `focusAfter` in place of `() => null` (`OwnFoodSheet.tsx:120`), as `PortionSheet` takes one (`FoodSheetStack.tsx:110`)                                                                                                                                                                                                                                                                                                                                                       |                                                                          |
| `apps/web/src/components/foods/FoodSheetStack.tsx`      | modified | Passes `logging` as one object, and `onDeleted` for a meal deleted from its sheet, to `SavedMealSheet`                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                                          |
| `apps/web/src/components/log/useSavedMealDelete.ts`     | new      | The one meal delete: `useConfirmedDelete` with the meal view's copy, `deleteSavedMeal` that takes `saved_meal_not_found` as done, then `afterSavedMealGone`, then the host's `onDone(meal)`. Both the log sheet's meal view and `SavedMealSheet` use it                                                                                                                                                                                                                                                                            | `useConfirmedDelete`, `deleteSavedMeal`, `afterSavedMealGone`            |
| `apps/web/src/components/foods/FoodSheet.tsx`           | modified | `removeMeal` becomes `useSavedMealDelete` with `onDone` set to the view reset. `afterDelete` (`FoodSheet.tsx:256-261`) keeps the view reset (`ownSheet.close()`, the search text, `nav.reset()`) and loses its meal cache write, which the helper now does. Its `onDeleted` for a meal deleted from `SavedMealSheet` is the same view reset. It never closes the meal sheet, which has closed itself                                                                                                                               |                                                                          |
| `apps/web/src/components/foods/FoodRow.tsx`             | modified | New optional `ownMark` prop, default true. The page passes false, since every row there is the person's own                                                                                                                                                                                                                                                                                                                                                                                                                        |                                                                          |
| `apps/web/src/lib/api/foods.ts`                         | modified | `getOwnFoods` asks for `limit=200`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |                                                                          |
| `apps/web/messages/en.json`                             | modified | The `recipes.*` keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                          |

`EmptyTab` stays, for Groceries.

## c) Data model

No change.

## d) API interface

No change. Every call is an existing route:

| Use                                 | Route                                                                                                                | Note                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Own foods                           | `GET /foods/own?limit=200`                                                                                           | Name order (`apps/backend/src/services/reads/foods.ts:50-58`). 200 is the route's maximum |
| A food to edit                      | `GET /foods/:id`                                                                                                     | `OwnFoodSheet` needs the `FoodDetail`, with its barcode                                   |
| Add, edit, delete a food            | `POST /foods`, `PUT /foods/:id`, `DELETE /foods/:id`                                                                 | A used food is hidden, not deleted (`writes/foods.ts:136-150`)                            |
| Saved meals, active and archived    | `GET /saved-meals`, `GET /saved-meals?archived=true`                                                                 | The whole list, no paging                                                                 |
| New, edit, archive, restore, delete | `POST /saved-meals`, `PUT /saved-meals/:id`, `PUT` and `DELETE /saved-meals/:id/archived`, `DELETE /saved-meals/:id` | A used meal is hidden, and its days keep their figures                                    |

**Counts and paging.** Not needed now. The saved meals answer whole. Own foods stop at 200. A count would only say "more than 200", which nobody has. Past 200 goes to TODO.

**Remove.** "Delete" means what it means in the log sheet. A food or meal no entry uses is deleted. One that entries use is hidden: it leaves every list and search, and every entry keeps its name and figures (`docs/features/days.md`, "Figures that stay"). Archive is the softer choice for a meal: it leaves the list and stays loggable.

**Assistant tools.** None exist yet. The connected AI step builds tools over `listOwnFoods`, `getFood`, `createOwnFood`, `updateOwnFood`, `deleteOwnFood`, `listSavedMeals`, `createSavedMeal`, `updateSavedMeal`, `setSavedMealArchived` and `deleteSavedMeal`. This page adds no service, so it adds nothing to that list.

## e) Data flow

1. The tab mounts. `OwnFoodsSection` and `SavedMealsSection` subscribe to `ownFoodsQuery()` and `savedMealsQuery(false)`. The Day tab has usually read both ahead, so the rows are there in the first render.
2. A food row is pressed. The row's button turns busy, `client.fetchQuery(foodDetailQuery(id))` runs (fresh from cache when the log sheet read it), and `OwnFoodSheet` opens on the answer with the row as `returnFocusTo`. A failure shows its line as a toast through the error copy, and the sheet does not open: no sheet is open at that moment, so the toast is in view. A food found gone (`food_not_found`) runs `afterFoodGone`, so the row leaves.
3. A save in `OwnFoodSheet` runs `afterOwnFoodSaved` as today. The row changes in place, or moves to its new place by name. On this page rows follow the cache: a list here is not under the finger while a sheet is open, and a rename that moves a row is the person's own action.
4. A meal row is pressed. `SavedMealSheet` opens in edit mode on the row's meal, with `archive`. **Archive meal** calls `useMealActions().setArchived(meal, true)`. The sheet stays open, the button turns into **Restore meal** with focus kept on it, and the row moves to the archived list under the sheet. That in-place turn is the one undo: no toast follows. A failure shows on the sheet's own form error line, where it is in view. **Delete** in the footer opens the confirmation stacked on the sheet ("Delete Chicken bowl?", "Days it was logged on keep their figures."). On confirm the sheet runs the shared `useSavedMealDelete` (the request, then `afterSavedMealGone`), closes itself, then calls `onDeleted`. The host's `onDeleted` only resets its own view. No host closes the meal sheet for it.
5. **New saved meal** opens `SavedMealSheet` with no `logging`. **Save meal** runs `afterSavedMealCreated`, the sheet closes and the meal shows in its place by name.
6. **Archived meals** toggles the inline archived list, which reads `savedMealsQuery(true)` on first open. **Restore** on a row restores it at once. A restore that fails there, with no sheet open, shows as a toast.
   The page logs nothing, so no day is read for any of this except what the sheets' own invalidation reads (planned entries follow an edit).

## f) Frontend architecture

**Layout.** One column at every width, in `PageContainer`, so the header's title and rule line up with the content, as on every tab (`apps/web/src/components/ui/PageContainer.tsx`). From `md` that column is the shared 40rem. One action row, then two sections, meals first:

```
Recipes                                   <- the shell's header
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
[ New saved meal ]  [  Add a food  ]
Saved meals
  Chicken bowl
  Wolt
  640 kcal · 42.0 g protein per meal
  ...
[Archived meals]

Your foods
  Protein Shake (BioTechUSA)          ★
  388 kcal · 80.0 g protein per 100 g
  ...
```

The action row is the log sheet's `CreateActions` pattern: two equal `btnSecondary` buttons, at least 48 px tall, side by side at every width. It sits at the top of the page, so **Add a food** is in the same place whatever the number of meals and whether the archived list is open. Each action has one mount site and is there when its list is empty. The section titles are plain `sectionTitle` headings. The page keeps the toast's room at its end (`PAGE_TOAST_END_CLASS`).

**Rows.** `SavedMealRow` with `meta` from `useMealFigures()` and `metaFigures`, no `trailing`. `FoodRow` with its default per-100 g line, the star of a favourite, and `ownMark={false}`. Both are at least 56 px tall.

**States and copy.**

| State                                       | Saved meals                                                                       | Your foods                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Loading                                     | The heading row alone                                                             | The heading row alone                                         |
| Empty                                       | "Meals you save appear here."                                                     | "Foods you add appear here."                                  |
| Cannot be read                              | "Your saved meals show here once Hovimestari can reach the server."               | "Your foods show here once Hovimestari can reach the server." |
| Archived list empty                         | "Meals you archive appear here."                                                  |                                                               |
| Archive or restore failed in the edit sheet | The sheet's form error line ("Could not confirm. Try again.", "You are offline.") |                                                               |
| Restore failed in the archived list         | Toast with the same line                                                          |                                                               |

The empty and archived lines reuse the log sheet's catalog entries where the words are the same, so one sentence has one key. Button labels: "New saved meal", "Add a food", "Archived meals", "Restore", "Archive meal", "Restore meal", and "Delete" in the meal sheet's footer, as in the own-food sheet. The delete confirmation's copy is the meal view's. The page shows no lead line under the header, since the section headings say what it holds and the shell rule is that a tab promises nothing about what is coming.

**Focus.** A sheet returns focus to the row or button that opened it. After a delete the opening row is gone and no sheet lies underneath (`BottomSheet.tsx:158-160`), so the page passes `focusAfterDelete` to both sheets: the next row in that list, else the previous one, else the action row's button for that list (`apps/web/src/lib/focusAfterRemoval.ts`).

**Sheets.** On this page they are top-level sheets, not stacked. Each delete confirmation is stacked on its own sheet, through `sheet.stacked`, so Base UI nests it: a `FormSheet` at full width below `md` and a dialog from `md`, as everywhere. Their heights and fields are as the log sheet's page doc measures them.

**State.** Server state only, through TanStack Query. Local state: the two sheet targets, the archived list's open flag, the busy row.

## g) Constraints and decisions

- The page lives at the existing route `/recipes`, so the tab bar, the rail and the service worker's page cache need nothing new.
- **Archive is page-only in the meal sheet, Delete is in the sheet everywhere.** Archive stays in the log sheet's meal view and is added to the sheet only where no meal view exists. Accepted as one smell, not two.
- **Two Delete controls for a meal in the log sheet, one delete.** The meal view keeps **Delete** (`MealView.tsx:66`), and the edit sheet stacked on it has its own. That is the own-food precedent: **Delete** in the food view (`FoodDetail.tsx:201`) and in the own-food sheet (`OwnFoodSheet.tsx:186`). Accepted as a stated trade-off, because the edit sheet needs Delete on this page, where no meal view exists, and a host-only Delete would make it a variant. The two controls run one implementation, `useSavedMealDelete`, so the request, the tolerance of a meal already gone and the cache write exist once.
- **`held` comes from `useToday().holding`.** `TodayProvider` wraps the whole shell (`TargetsGate.tsx:228`), so the page reads the same today as the Day tab. While the app asks the server for today, an archive or a save waits, as on the Day tab. Passing `false` would let a write through in the one moment every other surface holds it.
- No `HeldLists` on this page. That machinery watches the log sheet's four lists (`heldList.tsx:65-75`) and exists because a press there logs at once. A press here opens a sheet.
- The sheets stay where they are in the source tree (`components/foods/`, `components/log/`). Moving files would collide with work in flight and buys nothing.

### Rejected alternatives

| Alternative                                                               | Why it was rejected                                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A "Manage" view inside the log sheet                                      | Still behind logging, which is the problem. And the log sheet is tied to a day                                                |
| A section in Settings                                                     | Settings holds preferences. Foods and meals are content the person keeps, and Settings would grow a list of unbounded length  |
| Rendering `FoodSearchView` or `SavedMealList` on the page                 | Both carry "+", the day, the held lists and the source chips. Using them would mean switching each of those off for this page |
| Moving the sheets into a shared provider at the shell, opened by an event | A global sheet bus for two mount sites. The sheets are already props-driven components, so mounting them twice costs nothing  |

### Non-questions

- The tab keeps the name "Recipes" (Artur, 2026-11-18).
- Logging stays in the log sheet. This page is for keeping things (0.1, 0.2).
- The sheets are the existing ones (CLAUDE.md, overlays from the component library, one implementation).

## h) Open questions and risks

1. Archive in the meal's edit sheet on this page, and Delete in that sheet everywhere (0.5).
   > **Assumption:** built as described. One-line flip: leave `archive` unpassed, and Delete stays in the meal view only.
2. Asking for 200 own foods in one list, for both the page and the log sheet (0.6).
   > **Assumption:** built. One-line flip: back to the server's default of 100.
3. A filter on the page (0.4).
   > **Assumption:** none in this slice. Filed in TODO with the count at which it pays. One-line flip: add `SearchField` over both sections.
4. The own-food delete has the same pair of copies: `FoodSheet`'s `remove` and `OwnFoodSheet`'s `remove` each tolerate `food_not_found`. Not asked for.
   > **Assumption:** this slice moves them into `useOwnFoodDelete` beside `useSavedMealDelete`, since both files are already touched. One-line flip: leave the food pair as it is.

**Risks:**

- `feat/week-and-copy` is being built now. It touches the Day tab's launcher row, a new week sheet, `lib/invalidation.ts`, `lib/queryKeys.ts`, `lib/queryOptions.ts`, `lib/api/days.ts`, `messages/en.json`, `docs/features.md`, `docs/design/link-map.md` and `TODO.md`. Of these this slice edits `messages/en.json`, `docs/features.md`, the link map and `TODO.md`. Rebase after it merges rather than editing in parallel.
- The barcode slices (`docs/design/barcode.md`) change `OwnFoodSheet`'s `initialName` into `initial`. They come after this slice and update the callers in `components/recipes/`.
- `SavedMealSheet`'s props change. Its tests and `FoodSheetStack` change with it in the same commit, so the log sheet's behaviour is pinned before and after.

## i) Docs

- Page doc, new: `docs/app/recipes.md`, from `docs/_templates/page.md`. What the page is for, the two sections, the rows, the states and copy above, the archived list, focus, and links to the feature docs for every rule.
- `docs/app/shell.md`: the tabs paragraph. Recipes is no longer "Nothing here yet.", Groceries still is.
- `docs/app/log-sheet.md`: one sentence in the intro, that the Recipes tab keeps the same foods and meals. "A new saved meal": the edit sheet's **Delete**.
- `docs/features/saved-meals.md`: "Saving and logging a meal" no longer says saved meals live in the log sheet. "Where it appears" adds the Recipes tab. The edit sheet's Delete everywhere, and its archive on that page.
- `docs/features/foods.md`: the intro and "Where it appears" add the Recipes tab. "Your own foods": the lists show 200 at most.
- Catalog, `docs/features.md`: the Saved meals and Foods lines name the Recipes tab. A new page line: "**[Recipes](app/recipes.md)**: the saved meals and your own foods, to add, edit, archive and delete."
- Link map: new rows under The app for "Recipes tab, keeping foods and meals" → `app/recipes.md` (Doc), and the archived list on it → `app/recipes.md#archived-meals`.
- `TODO.md`: delete "Saved meals live in the log sheet". Add "Own foods past 200" and "A filter on the Recipes tab", each with who decides.

## j) Implementation plan

One slice, web only. Nothing is missing on the server.

| Step | Agent                    | Invoked by               | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Exit check                                                                                     |
| ---- | ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | frontend-engineer        | orchestrator             | Sections b, e and f. Files it may touch: `app/(app)/recipes/page.tsx`, `components/recipes/` (new), `components/log/SavedMealSheet.tsx`, `components/foods/OwnFoodSheet.tsx`, `components/foods/FoodSheetStack.tsx`, `components/foods/FoodSheet.tsx`, `components/foods/FoodRow.tsx`, `components/log/useSavedMealDelete.ts` (new), `components/foods/useOwnFoodDelete.ts` (new, see h4), `lib/api/foods.ts`, `messages/en.json`, their `__tests__/`, the docs in section i, `TODO.md`                     | Tests below green. `pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm docs:check` |
| 2    | validator                | frontend-engineer        | Against section 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Pass, or two fix cycles then escalate                                                          |
| 3    | ui-validator             | validator (user-visible) | 320, 375, 390 and 1280 wide, light and dark. Empty, a few, 40 rows. Each sheet opened from the page. Rename moves the row and focus returns to it. Across states: **Add a food** at the same place with 0, 5 and 40 meals and with the archived list open and closed. A delete confirmation over a sheet ignores Escape and outside presses on the sheet under it. At 320 wide the two top action buttons have the same height, whether or not "New saved meal" wraps to two lines, measured in the browser | Matches `docs/app/recipes.md`                                                                  |
| 4    | reviewer                 | ui-validator             | Diff and docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | No open critical or major finding                                                              |
| 5    | documentation-specialist | orchestrator             | Catalog, page doc, link map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm docs:check` clean                                                                        |

Every agent logs its start and end in `logs.txt`.

**Tests, with the properties that must hold across states:**

- An edit on the page shows in the log sheet, and the reverse. Render the page and the log sheet on one query client. Rename a meal on the page, then open the log sheet: its Saved meals shows the new name. Rename a food in the log sheet, unmount it, mount the page: the row shows the new name. One query key each, asserted by reading the cache.
- A meal saved on the page with no `logging` sends `POST /saved-meals` and never `POST /saved-meals/log`, and shows no Eaten or planned.
- `SavedMealSheet` from the log sheet still shows Eaten or planned and Save and log (the existing suite passes unchanged apart from the prop shape).
- Removing a food or a meal here never changes a past day: already pinned on the server by `apps/backend/src/routes/__tests__/figuresStay.db.test.ts:75` (a used food is hidden, entries stay) and `:161` (a used meal is hidden, entries stay). The page calls the same routes, so no new server test.
- Archive from the edit sheet: the row leaves the active list and appears in the archived list, the button turns into **Restore meal** with focus kept on it, and pressing it puts the row back. No toast is shown.
- Delete from the meal sheet, from the page and from the log sheet: the confirmation renders inside the sheet's `stacked` slot, the meal leaves every list, and focus lands on the next row (page) or the search field (log sheet), never on `<body>`.
- Delete from the own-food sheet on the page: focus lands on the next row, never on `<body>`.
- One meal delete: the log sheet's meal view and the meal sheet both send one `DELETE /saved-meals/:id` through `useSavedMealDelete`, treat `saved_meal_not_found` as done, and leave the meal out of every list. From the meal sheet stacked on the log sheet's meal view, the meal sheet is closed after the confirm and the log sheet is back at its search.
- `held`: while `useToday().holding` is true, **Archive meal** on the page sends nothing.
- `getOwnFoods` sends `limit=200`.

## Resolved defaults (orchestrator, 2026-11-18, owner may veto)

- A row opens its edit sheet directly: the page keeps, the log sheet logs. Veto cost: a view stack on the page.
- No "+" on the page's rows. Veto cost: `AgainButton` with today as the day.
- The star is read-only here. Veto cost: `FavouriteButton` as the row's trailing control.
- No filter until the lists grow. Veto cost: half a day.
- Archive in the meal edit sheet on this page, Delete in that sheet everywhere. Veto cost: drop one prop.
- Own foods load 200 at a time in both places. Veto cost: one argument.
- Meals first, foods second, one column at every width, both add buttons in one row at the top. Veto cost: swap two components.
- Two Delete controls for a meal in the log sheet, one shared delete behind them. Veto cost: drop Delete from the meal view.
- The page's writes wait on `useToday().holding`, as the Day tab's do. Veto cost: pass `false`.

## Review round 1, answered

- F1, the meal delete confirmation in the wrong tree: accepted. `SavedMealSheet` owns its delete as `OwnFoodSheet` does, the dialog in `sheet.stacked`, for every host. Sections 0.5, b, e, f, g and j changed.
- F2, two undos for archive: accepted. Restore meal in place is the one undo, the toast row and its test are gone, and archive failures in the sheet show on its form error line. A restore from the inline archived list, with no sheet open, still uses a toast.
- F3, `manage` as a page-only variant: kept for archive only, renamed `archive`, and stated as a deliberate trade-off in section 1 and section g. Delete is no longer a variant (F1).
- F4, focus after a delete: accepted. `focusAfterDelete` on `OwnFoodSheet` and `SavedMealSheet`, `OwnFoodSheet.tsx` added to the files, and a test that focus never lands on `<body>`.
- F5, `sources`: accepted. `RecipesTab` derives them with `sourcesOf(savedMealsQuery(false))`.
- F6, the db tests exist: accepted. Section 1 and the tests cite `figuresStay.db.test.ts:75` and `:161`. No new server test.
- F7, Add a food far down: accepted. One action row at the top with both buttons, the log sheet's `CreateActions` pattern, and a ui-validator check that it stays in place with 0, 5 and 40 meals and the archived list open or closed. Layout redrawn.
- F8, cites: `DayTab.tsx:198`. The reuse paragraph names only the two sheets the page mounts.
- F9, defaults Artur does not see here: for the orchestrator, who puts the resolved defaults in the PR body. No change to the doc.

## Delta review, answered

- D6, Delete in two places with two copies of its logic: accepted. `useSavedMealDelete` holds the request, its tolerance of a meal already gone and the cache write, and both the meal view and `SavedMealSheet` call it. The meal sheet closes itself, and `FoodSheet`'s `onDeleted` only resets the log sheet's view. The two Delete controls are stated in section g as a trade-off that follows the own-food precedent. The same move for the own-food pair is open question 4, built by default.
- D7, what the page needs: accepted. `held` is `useToday().holding`, from the `TodayProvider` around the shell, with a test. The ui-validator's 320 check asserts both top action buttons have the same height whether or not a label wraps. One mount per action was already stated in section f.
