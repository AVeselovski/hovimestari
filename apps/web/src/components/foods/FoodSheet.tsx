"use client";

import { ArchivedMealsView } from "@/components/log/ArchivedMealsView";
import type { BrowseLogging } from "@/components/log/browseLogging";
import { HeldLists, releaseHeldLists } from "@/components/log/heldList";
import { LogBlock } from "@/components/log/LogBlock";
import { LogFooter } from "@/components/log/LogFooter";
import { sourcesOf } from "@/components/log/mealFilter";
import { MealView } from "@/components/log/MealView";
import { LOG_RECIPE_ROW_ATTRIBUTE } from "@/components/log/RecipeRows";
import { RecipeView } from "@/components/log/RecipeView";
import { ARCHIVED_ATTRIBUTE } from "@/components/log/SavedMealList";
import { MEAL_ROW_ATTRIBUTE } from "@/components/log/SavedMealRow";
import { StatusLine, useStatusMessage } from "@/components/log/StatusLine";
import { useLogAgain } from "@/components/log/useLogAgain";
import { useLogForm, type LogTarget } from "@/components/log/useLogForm";
import { sayIfFailed, useMealActions } from "@/components/log/useMealActions";
import { useSavedMealDelete } from "@/components/log/useSavedMealDelete";
import { batchStartOf, useCookSheet } from "@/components/recipes/useCookSheet";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import type { AddDone, EntryActions } from "@/hooks/entryActions";
import { useArmedAtRest } from "@/hooks/useArmedAtRest";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { foodNameLangs, useFoodNameLanguage } from "@/hooks/useFoodNameLanguage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { afterFoodGone, afterRecipeGone, afterSavedMealGone } from "@/lib/invalidation";
import {
  detailUnavailable,
  foodDetailQuery,
  prefetchLogLists,
  recipesQuery,
  savedMealsQuery,
} from "@/lib/queryOptions";
import { keepDayPlace, markOpenedInApp } from "@/lib/recipeNav";
import type { EntryStatus, FoodSummary, LastAmount, RecipeSummary, SavedMeal } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { ADD_PORTION_ATTRIBUTE, FoodDetailBody, FoodDetailHeader } from "./FoodDetail";
import { FOOD_ROW_ATTRIBUTE, rowSelectorOf } from "./FoodRow";
import { Browse, leadResults, type MealBrowsing } from "./FoodSearchView";
import { FoodSheetStack, type MealSheetTarget, type PortionTarget } from "./FoodSheetStack";
import { logTargetOf, typedLastOf, viewKey, type View } from "./foodSheetView";
import { useFavourite } from "./useFavourite";
import { useFoodFinder } from "./useFoodFinder";
import { useOwnFoodDelete } from "./useOwnFoodDelete";
import { useSheetNavigation } from "./useSheetNavigation";

// ---------------------------------------------------------------------------
// FoodSheet: the log sheet. One tall sheet that logs to the date it opened
// with, its views on one navigation stack, because moving from a row to a
// food and back is navigation, not a form:
//
// - Search: the food search (`useFoodFinder`), its field pinned in the
//   header, its scanner and own-food sheets stacked. Under it "New meal"
//   and "Add an estimate", the recent items, the favourites, the recipes, the
//   saved meals and the user's own foods, or the results of what is typed,
//   recipes first, then saved meals. A recent item, a recipe, a saved meal,
//   and a favourite with a last amount, logs again in one press ("+",
//   `useLogAgain`). A typed barcode puts the
//   search in barcode mode (`useBarcodeMode`): Look up or Enter sends it, a
//   food found opens its food view while the search still shows that code,
//   and anything else offers the own-food form from the label. The camera
//   button in the empty field opens the scanner (`useScanner`), whose read
//   types the code and looks it up at once.
// - Food: Back, the name and the star in the header. The log block on top,
//   then the food's detail, scrolling. Log in the pinned footer.
// - Meal: Back and the meal's name. The log block with the number of meals,
//   then the meal's figures and Edit, Archive or Restore, Delete. Log in the
//   pinned footer.
// - Recipe: Back and the recipe's name. The log block with the servings, then
//   one serving's figures and Open recipe, which leaves the sheet for the
//   recipe's page and keeps the day's place for the way back. Log in the
//   pinned footer.
// - Archived meals: Back and the title. The archived meals, each with Restore.
//
// The header's first line, in every view, names the day the sheet logs to,
// or a "+" that failed (`StatusLine`). The sheet's height is fixed
// (`size="tall"`), so its top edge is the same in every view and state, with
// and without the footer, also with a keyboard up.
//
// A log closes the sheet, and its toast shows once the sheet has closed. A
// view whose amount differs from its prefill, or whose log runs, refuses a
// swipe and springs back. Back always leaves it.
//
// The scanner, the forms (own food, portion, saved meal, estimate) and the
// delete confirmations are sheets of their own, stacked on this one
// (`FoodSheetStack`). A saved meal or an estimate logged from one closes both
// sheets in one update.
// ---------------------------------------------------------------------------

export { SEARCH_DEBOUNCE_MS } from "./useFoodFinder";

export interface FoodSheetProps {
  open: boolean;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
  /** The date the sheet logs to, fixed for the open. */
  date: string;
  /** The add, and whether writes wait (`useEntryActions`). */
  actions: Pick<EntryActions, "add" | "saveAndLog" | "withdrawAdd" | "logCook" | "holding">;
}

export function FoodSheet({ open, onClose, returnFocusTo, date, actions }: FoodSheetProps): ReactElement {
  const t = useTranslations("foods.sheet");
  const tLog = useTranslations("log");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const { today } = useToday();
  const nameLanguage = useFoodNameLanguage();
  const armed = useArmedAtRest(open, isMobile);

  const [notice, setNotice] = useState<string | null>(null);
  // The source chip chosen while browsing, which filters the meals in the results too.
  const [source, setSource] = useState<string | null>(null);
  // Whether the Recipes list shows all of its recipes, for this open: through a view and a search and back.
  const [allRecipes, setAllRecipes] = useState(false);
  const status = useStatusMessage();

  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const nav = useSheetNavigation<View>({ kind: "search" }, { content: contentRef, back: backRef, field: inputRef });
  const view = nav.view;

  const detailId = view.kind === "food" ? view.food.id : null;
  const detail = useQuery({ ...foodDetailQuery(detailId ?? ""), enabled: detailId !== null });
  const favourite = useFavourite(detailId ?? "");

  const portionSheet = useSheetTarget<PortionTarget>();
  const mealSheet = useSheetTarget<MealSheetTarget>();
  const estimateSheet = useSheetTarget<string>();
  // The lists follow their data only while they cannot be pressed: the sheet
  // slides in, or a sheet stacked on it is open (heldList.tsx). While that
  // sheet slides away its backdrop swallows every press.
  // The batch sheet, from the recipe view's Log as made. Logged, it and this sheet close in one update.
  const cook = useCookSheet(actions, {
    mayOpen: (asked) => open && view.kind === "recipe" && view.recipe.id === asked.recipeId,
    onReadFailed: (line) => status.say(line, "failure"),
    onLogged: (announce) => {
      cook.close();
      onLogged({ outcome: "created", announce });
    },
  });
  const hostStackedOpen = [portionSheet, mealSheet, estimateSheet, cook].some((s) => s.isOpen);
  const finder = useFoodFinder({
    open,
    canPick: view.kind === "search" && !hostStackedOpen,
    inputRef,
    contentRef,
    say: (note) => status.say(note, "note"),
    onPick: showFood,
    onSavedOwnFood: (saved, row) => {
      if (view.kind === "food" && view.food.id === saved.id) return;
      // A copy saved from a food's view opens with the grams typed there. The form is read at the save, not now.
      showFood(saved, row, view.kind === "food" ? typedLastOf(form) : undefined);
    },
    onOwnFoodDeleted: (id) => afterDelete(id),
    onFoodGone: foodGone,
    onType: () => setNotice(null),
  });
  const stackedOpen = hostStackedOpen || finder.stackedOpen;
  const listsFollow = !armed.armed || stackedOpen;
  const activeMeals = useQuery(savedMealsQuery(false)).data?.meals;
  const sources = activeMeals ? sourcesOf(activeMeals) : [];
  const activeRecipes = useQuery(recipesQuery(false)).data?.recipes;

  // The toast of a log, shown once the sheet has closed. The sheet closes as
  // the answer lands: a second tap of a double tap meets the closing sheet,
  // which swallows it (components/ui/closingSheet.ts).
  const announceRef = useRef<(() => void) | null>(null);
  const onLogged = useCallback(
    (done: AddDone) => {
      announceRef.current = done.announce;
      onClose();
    },
    [onClose],
  );
  /** A stacked sheet logged: it and this sheet close in this one update, never this one alone. */
  const onLoggedFromStack = (done: AddDone): void => {
    mealSheet.close();
    estimateSheet.close();
    onLogged(done);
  };

  // Read at the press, so a "+" after midnight plans or logs by the new today.
  const todayRef = useRef(today);
  useLayoutEffect(() => {
    todayRef.current = today;
  }, [today]);
  const statusAt = useCallback(
    (): EntryStatus => (todayRef.current !== null && date > todayRef.current ? "planned" : "eaten"),
    [date],
  );

  /** Opens the food view. `row` is the row that opened it, or a selector for the row Back focuses. */
  function showFood(food: FoodSummary, row: HTMLElement | string | null, last: LastAmount | null | undefined): void {
    setNotice(null);
    const next: View = { kind: "food", food, last };
    // A view over the search goes back to the search, never to another food.
    if (nav.depth > 1) nav.swap(next);
    else nav.open(next, typeof row === "string" || row === null ? row : rowSelectorOf(row, FOOD_ROW_ATTRIBUTE));
  }

  function showMeal(meal: SavedMeal, opener: HTMLElement, lastCount: number | null): void {
    setNotice(null);
    nav.open({ kind: "meal", meal, lastCount }, rowSelectorOf(opener, MEAL_ROW_ATTRIBUTE));
  }

  function showRecipe(recipe: RecipeSummary, opener: HTMLElement, lastServings: number | null): void {
    setNotice(null);
    nav.open({ kind: "recipe", recipe, lastServings }, rowSelectorOf(opener, LOG_RECIPE_ROW_ATTRIBUTE));
  }

  /** The meal view shows `meal` as it now is, edited, archived or restored, keeping what was typed. */
  function showMealAs(meal: SavedMeal): void {
    if (nav.view.kind === "meal" && nav.view.meal.id === meal.id) nav.replace({ ...nav.view, meal });
  }

  /**
   * The open food is gone (deleted on another device, or no longer visible):
   * any sheet stacked on it closes, and the sheet returns to the search with
   * a line that says so. Its row is gone too, so focus goes to the field.
   */
  function foodGone(id: string): void {
    finder.ownSheet.close();
    portionSheet.close();
    setNotice(t("gone"));
    nav.reset();
    finder.forget(id);
    void afterFoodGone(client, id);
  }

  /** A saved meal is gone: any sheet on it closes, and the sheet goes back to browsing with a line that says so. */
  function mealGone(id: string): void {
    mealSheet.close();
    setNotice(tLog("mealGone"));
    nav.reset();
    void afterSavedMealGone(client, id);
  }

  /** A recipe is gone, deleted elsewhere: the sheet goes back to browsing with a line that says so. */
  function recipeGone(id: string): void {
    setNotice(tLog("recipeGone"));
    nav.reset();
    void afterRecipeGone(client, id);
  }

  const onGone = (kind: LogTarget["kind"] | "saved_meal", id: string): void =>
    kind === "food" ? foodGone(id) : kind === "recipe" ? recipeGone(id) : mealGone(id);

  const sayFailure = useCallback((text: string) => status.say(text, "failure"), [status]);
  const meals = useMealActions({ held: actions.holding, onGone: mealGone });
  /** Archives or restores a meal, a failure on the status line, then `then` with the meal as it now is. */
  const archiveMeal = (meal: SavedMeal, archived: boolean, then?: (now: SavedMeal) => void): void =>
    void meals.setArchived(meal, archived).then((outcome) => {
      const now = sayIfFailed(outcome, sayFailure);
      if (now) then?.(now);
    });

  const again = useLogAgain({ date, statusAt, actions, onLogged, onGone, sayFailure });

  const logTarget = logTargetOf(view, detail.data);
  const form = useLogForm({
    key: viewKey(view),
    target: logTarget,
    date,
    today,
    actions,
    onLogged,
    onGone,
  });

  const gone = detailId !== null && getErrorCode(detail.error) === "food_not_found";
  const favouriteGone = getErrorCode(favourite.error) === "food_not_found";
  useEffect(() => {
    if (detailId !== null && (gone || favouriteGone)) foodGone(detailId);
    // Runs when the food turns out to be gone, not on every render.
  }, [gone, favouriteGone]);

  // The deletes run the shared helpers, which also drop the own food or the saved meal from every list.
  const remove = useOwnFoodDelete<FoodSummary>({ onDone: (deleted) => afterDelete(deleted.id) });
  const removeMeal = useSavedMealDelete({ onDone: () => afterDelete() });

  /** After the open own food or saved meal is deleted: the browse view, with focus in the search field. A recipe is deleted on its page. */
  function afterDelete(foodId?: string): void {
    if (foodId !== undefined) finder.forget(foodId);
    finder.ownSheet.close();
    finder.reset();
    nav.reset();
  }

  const food = view.kind === "food" ? (detail.data ?? view.food) : null;
  const shownFavourite = favourite.pending ?? food?.isFavourite ?? false;
  const logging: BrowseLogging = {
    again,
    held: actions.holding,
    planned: statusAt() === "planned",
    onOpenFood: (row, opener, last) => showFood(row, opener, last),
    onOpenMeal: showMeal,
    onOpenRecipe: showRecipe,
  };

  const mealBrowsing: MealBrowsing = {
    source,
    onSource: setSource,
    onNewMeal: (name, opener) => mealSheet.open(opener, { name }),
    onEstimate: (name, opener) => estimateSheet.open(opener, name),
    onArchived: (opener) => {
      setNotice(null);
      nav.open({ kind: "archived" }, rowSelectorOf(opener, ARCHIVED_ATTRIBUTE));
    },
  };

  let viewHeader: ReactElement;
  if (view.kind === "food" && food) {
    viewHeader = (
      <FoodDetailHeader
        name={food.name}
        lang={foodNameLangs(food, nameLanguage).name}
        favourite={shownFavourite}
        backRef={backRef}
        onBack={nav.back}
        onToggleFavourite={() => favourite.toggle(food, !shownFavourite)}
      />
    );
  } else if (view.kind === "meal") {
    viewHeader = <FoodDetailHeader name={view.meal.name} backRef={backRef} onBack={nav.back} />;
  } else if (view.kind === "recipe") {
    viewHeader = <FoodDetailHeader name={view.recipe.name} backRef={backRef} onBack={nav.back} />;
  } else if (view.kind === "archived") {
    viewHeader = <FoodDetailHeader name={tLog("archived.title")} backRef={backRef} onBack={nav.back} />;
  } else {
    viewHeader = finder.field;
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={
        food ? food.name : view.kind === "meal" ? view.meal.name : view.kind === "recipe" ? view.recipe.name : t("name")
      }
      header={
        <div className="space-y-1.5">
          <StatusLine date={date} message={status.message} />
          {viewHeader}
        </div>
      }
      size="tall"
      keyboardAware
      dismissible={!form.dirty && !form.submitting}
      returnFocusTo={returnFocusTo}
      panelClassName="md:max-w-lg"
      onOpened={armed.onOpened}
      onClosed={() => {
        // The lists it held, read now that no list of it is left to cancel the read, so the next open shows them.
        prefetchLogLists(client);
        const announce = announceRef.current;
        announceRef.current = null;
        announce?.();
      }}
      footer={logTarget !== null ? <LogFooter form={form} held={actions.holding} /> : undefined}
      stacked={
        <FoodSheetStack
          finder={finder.stacked}
          portionSheet={portionSheet}
          mealSheet={mealSheet}
          estimateSheet={estimateSheet}
          logging={{
            date,
            actions,
            sources,
            onLogged: onLoggedFromStack,
            onSavedMeal: (meal) => {
              // A new meal shows in its place in the list under the closing sheet, an edit in place.
              releaseHeldLists(client);
              status.say(tLog("meal.saved", { name: meal.name }), "note");
              showMealAs(meal);
            },
            onMealGone: mealGone,
            // The meal sheet has closed itself: the view goes back to browsing.
            onMealDeleted: () => afterDelete(),
          }}
          confirmation={
            <>
              {remove.dialog}
              {removeMeal.dialog}
              {cook.sheet}
            </>
          }
          onFoodGone={foodGone}
          focusAfterPortionDelete={() =>
            contentRef.current?.querySelector<HTMLElement>(`[${ADD_PORTION_ATTRIBUTE}]`) ?? null
          }
        />
      }
    >
      <PromptSheetBody focusSelf={isMobile}>
        <div ref={contentRef}>
          {view.kind === "food" && food ? (
            <div className="space-y-8">
              <LogBlock form={form} autoFocus={false} />
              <FoodDetailBody
                summary={view.food}
                detail={detail.data}
                unavailable={detailUnavailable(detail)}
                favouriteError={favourite.error && !favouriteGone ? errors.forError(favourite.error) : null}
                onLeave={onClose}
                onAddPortion={(opener) => portionSheet.open(opener, { foodId: food.id })}
                onEditPortion={(portion, opener) => portionSheet.open(opener, { foodId: food.id, portion })}
                onEdit={(loaded, opener) => finder.ownSheet.open(opener, { food: loaded })}
                copy={finder.copy}
                onDelete={(opener) => remove.open(food, opener)}
              />
            </div>
          ) : view.kind === "meal" ? (
            <MealView
              meal={view.meal}
              form={form}
              busy={meals.busyId === view.meal.id}
              held={actions.holding}
              onEdit={(opener) => mealSheet.open(opener, { meal: view.meal, name: view.meal.name })}
              onArchive={(archived) => archiveMeal(view.meal, archived, showMealAs)}
              onDelete={(opener) => removeMeal.open(view.meal, opener)}
            />
          ) : view.kind === "recipe" ? (
            <RecipeView
              recipe={view.recipe}
              form={form}
              readingForBatch={cook.reading}
              onLogAsMade={(opener) =>
                // The batch starts with the servings and the state the log block holds.
                cook.open(opener, { recipeId: view.recipe.id, day: date, start: batchStartOf(form) })
              }
              onLeave={() => {
                // Back from the recipe's page shows this day where it was (lib/recipeNav.ts).
                markOpenedInApp();
                keepDayPlace(null);
                onClose();
              }}
            />
          ) : view.kind === "archived" ? (
            <ArchivedMealsView
              onOpenMeal={(meal, opener) => showMeal(meal, opener, meal.lastCount)}
              onRestore={(meal) => archiveMeal(meal, false)}
              busyId={meals.busyId}
              held={actions.holding}
            />
          ) : (
            <div {...armed.guardProps}>
              <HeldLists follow={listsFollow}>
                {finder.results({
                  notice,
                  browse: (
                    <Browse
                      onOpen={(row, opener) => showFood(row, opener, undefined)}
                      onAddOwn={(name, opener) => finder.ownSheet.open(opener, { start: { name } })}
                      logging={logging}
                      meals={mealBrowsing}
                      recipes={{ all: allRecipes, onShowAll: () => setAllRecipes(true) }}
                    />
                  ),
                  lead: leadResults({ recipes: activeRecipes, meals: activeMeals, logging, browsing: mealBrowsing }),
                })}
              </HeldLists>
            </div>
          )}
        </div>
      </PromptSheetBody>
    </BottomSheet>
  );
}
