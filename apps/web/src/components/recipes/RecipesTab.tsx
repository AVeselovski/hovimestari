"use client";

import { OwnFoodSheet } from "@/components/foods/OwnFoodSheet";
import { SearchField } from "@/components/foods/SearchField";
import { sourcesOf } from "@/components/log/mealFilter";
import { MEAL_ROW_ATTRIBUTE } from "@/components/log/SavedMealRow";
import { SavedMealSheet, type EditSavedMeal } from "@/components/log/SavedMealSheet";
import { sayIfFailed, useMealActions } from "@/components/log/useMealActions";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  btnWide,
  fieldWithButtonField,
  fieldWithButtonRow,
  segmentActive,
  segmentButton,
  segmentButtonFieldHeight,
  segmentedTray,
  segmentedTrayFieldHeight,
  segmentInactive,
} from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { afterFoodGone, afterSavedMealGone } from "@/lib/invalidation";
import { isFreshRead } from "@/lib/queryClient";
import { foodDetailQuery, savedMealsQuery } from "@/lib/queryOptions";
import { markOpenedInApp, readListPlace, scrollPageToTop, takeFocusAfterDelete } from "@/lib/recipeNav";
import type { FoodDetail, FoodSummary, SavedMeal } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { OwnFoodsSection } from "./OwnFoodsSection";
import { RecipeEditorSheet } from "./RecipeEditorSheet";
import { RecipeFilterButton } from "./RecipeFilterButton";
import { RecipeFilterSheet } from "./RecipeFilterSheet";
import { RecipeList, type ListArrival } from "./RecipeList";
import { filterCount, NO_FILTER, type ListFilter } from "./recipeListFilter";
import { SavedMealsSection } from "./SavedMealsSection";

// ---------------------------------------------------------------------------
// RecipesTab: the Library, where a person keeps their recipes, their saved
// meals and their own foods. Three segments, Recipes, Meals and Foods, one
// list at a time, the segment in the address (`?show=recipes|meals|foods`,
// written with `replace`, so Back and a reload keep it). The segments, the
// segment's one action (New recipe, New meal or New food) and its search
// field are one height, 48px, and sit in the same place whatever the
// segment. The search filters its list on the device, and each segment keeps
// its own search while the page is open. On Recipes the search row ends in
// Filter (`RecipeFilterButton`), which opens the filter sheet: the order of
// the list and bounds on a serving's figures, held here and given to the
// list. On Meals and Foods the search field takes the whole row.
//
// - Back from a recipe opened by a row, the tab opens on the list as that
//   row left it: its search here, and the chips, the archived list, the
//   scroll and the row in `RecipeList` (lib/recipeNav.ts). After a delete
//   on a recipe's page, the row that page named takes focus. Reached any
//   other way, such as by the tab bar or by a way back with nothing kept,
//   it opens fresh at its top: `<main>` keeps the scroll of the page before.
// - Recipes: the chips and the list (`RecipeList`). A row opens the recipe's
//   page. New recipe opens the editor, and a saved recipe opens its page.
// - Meals and Foods: the saved meals with the archived ones, and the own
//   foods. A row opens its edit sheet directly: this page keeps things, and
//   the log sheet logs them.
// - The sheets are the log sheet's own, top-level here: `SavedMealSheet`
//   without `logging` (save only) and with `archive`, and `OwnFoodSheet`.
//   Each delete confirmation is stacked on its own sheet.
// - The lists read the same cached queries as the log sheet, and every
//   write edits them, so a change in either place shows in the other.
// - A food row opens its sheet at once on the food's cached detail when it
//   is fresh, and offline on any cached detail. Otherwise it reads the
//   detail first, and the row shows it is busy meanwhile. Any other open
//   while that read is out wins, and the read's answer is dropped, so one
//   sheet opens, the last one asked for. A failed read shows as a toast,
//   since no sheet is open.
// - Writes wait while the app asks the server for today, as on the Day tab.
// - After a delete, focus goes to the next row of that list, else the row
//   before, else the segment's action. After Clear search, to the search
//   field.
// ---------------------------------------------------------------------------

const SEGMENTS = ["recipes", "meals", "foods"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** The segment an address names, recipes by default. */
export function segmentOf(show: string | null): Segment {
  return (SEGMENTS as readonly string[]).includes(show ?? "") ? (show as Segment) : "recipes";
}

export function RecipesTab(): ReactElement {
  const t = useTranslations("recipes");
  const tSegments = useTranslations("recipes.segments");
  const tSearch = useTranslations("recipes.search");
  const tLists = useTranslations("lists");
  const tFoods = useTranslations("foods.sheet");
  const tLog = useTranslations("log");
  const errors = useErrorCopy();
  const offlineLine = useFailureLine("form");
  const client = useQueryClient();
  const toast = useToast();
  const offline = useKnownOffline();
  const { holding } = useToday();

  const pageRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = `${useId()}-search`;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The segment the address names. A tap on the tab bar's Recipes, with no ?show=, comes back to Recipes.
  const named = segmentOf(params.get("show"));
  const [segment, setSegment] = useState<Segment>(named);
  const [seen, setSeen] = useState(named);
  // How the tab was reached: the list as a row left it, on the way back from that recipe, or the row
  // a delete named. It serves the list's first showing only.
  const [arrival, setArrival] = useState<ListArrival | null>(() =>
    typeof window === "undefined" ? null : { place: readListPlace(), focus: takeFocusAfterDelete() },
  );
  // The recipes' order and bounds, set in the filter sheet. They last as long as the recipes segment shows.
  const [filter, setFilter] = useState<ListFilter>({
    sort: arrival?.place?.sort ?? "name",
    bounds: arrival?.place?.bounds ?? {},
  });
  const filterSheet = useSheetTarget();
  const [atTop] = useState(arrival === null || (arrival.place === null && arrival.focus === null));
  useLayoutEffect(() => {
    if (atTop) scrollPageToTop();
  }, [atTop]);
  if (named !== seen) {
    setSeen(named);
    setSegment(named);
    setArrival(null);
    setFilter(NO_FILTER);
  }
  const [queries, setQueries] = useState<Record<Segment, string>>({
    recipes: arrival?.place?.query ?? "",
    meals: "",
    foods: "",
  });
  const query = queries[segment];
  const setQuery = (text: string): void => setQueries((q) => ({ ...q, [segment]: text }));
  /** Clear search, from the line that says none match: the line and its button go, so focus moves to the search field. */
  const clearQuery = (): void => {
    setQuery("");
    searchRef.current?.focus();
  };
  const recipeEditor = useSheetTarget();
  const roving = useRovingChoice(SEGMENTS, segment, choose);

  function choose(next: Segment): void {
    // The chosen segment pressed again changes nothing: its list stays mounted, so dropping the filter here would
    // leave the chips and lose the order and the bounds.
    if (next === segment) return;
    setSegment(next);
    setArrival(null);
    setFilter(NO_FILTER);
    router.replace(next === "recipes" ? pathname : `${pathname}?show=${next}`, { scroll: false });
  }
  // A meal to edit, or null for a new one. A food to edit, or null for a new one.
  const mealSheet = useSheetTarget<SavedMeal | null>();
  const ownSheet = useSheetTarget<FoodDetail | null>();
  const [archivedOpen, setArchivedOpen] = useState(false);
  // The food whose detail is being read to open its sheet.
  const [openingId, setOpeningId] = useState<string | null>(null);
  // Counts every open from this page, so a food read that answers after another open is dropped.
  const opens = useRef(0);

  const activeMeals = useQuery(savedMealsQuery(false)).data?.meals;
  const sources = activeMeals ? sourcesOf(activeMeals) : [];

  const say = useCallback((message: string) => toast.show({ message }), [toast]);

  /** The meal is gone, deleted on another device: its sheet closes and the lists drop it. */
  const closeMeal = mealSheet.close;
  const mealGone = useCallback(
    (id: string) => {
      closeMeal();
      void afterSavedMealGone(client, id);
      say(tLog("mealGone"));
    },
    [client, closeMeal, say, tLog],
  );
  const meals = useMealActions({ held: holding, onGone: mealGone });

  /** Opens a sheet from this page. A food read still out is dropped. */
  function opened(): void {
    opens.current += 1;
    setOpeningId(null);
  }

  function foodGone(id: string): void {
    ownSheet.close();
    void afterFoodGone(client, id);
    say(tFoods("gone"));
  }

  /**
   * Opens the food's sheet. On a cached detail that is fresh (read within
   * the stale time and not invalidated since) it opens at once, and offline
   * on any cached detail. Otherwise it reads the detail first, the row busy
   * meanwhile, so the form never starts from values a later edit replaced.
   */
  async function openFood(food: FoodSummary, opener: HTMLElement): Promise<void> {
    opened();
    const ticket = opens.current;
    const query = foodDetailQuery(food.id);
    const state = client.getQueryState(query.queryKey);
    const cached = state?.data;
    if (cached && (isFreshRead(state) || offline)) {
      ownSheet.open(opener, cached);
      return;
    }
    if (offline) {
      say(offlineLine(new OfflineError()));
      return;
    }
    setOpeningId(food.id);
    try {
      const detail = await client.fetchQuery(query);
      if (ticket === opens.current) ownSheet.open(opener, detail);
    } catch (err) {
      const gone = getErrorCode(err) === "food_not_found";
      // A food that is gone leaves the lists whatever opened since. Only the latest open speaks.
      if (gone && ticket !== opens.current) void afterFoodGone(client, food.id);
      if (ticket !== opens.current) return;
      if (gone) foodGone(food.id);
      else say(errors.forError(err));
    } finally {
      if (ticket === opens.current) setOpeningId(null);
    }
  }

  const mealOpen = mealSheet.shown;
  const rowOpens = t("rowOpens");

  /** The edit sheet's part for `meal`: archive in place, and focus after a delete. */
  function editMeal(meal: SavedMeal): EditSavedMeal {
    return {
      kind: "edit",
      meal,
      archive: { busy: meals.busyId === meal.id, set: (archived) => meals.setArchived(meal, archived) },
      onGone: mealGone,
      focusAfterDelete: () => {
        // The row may have moved between the two lists since the sheet opened.
        const row = pageRef.current?.querySelector<HTMLElement>(`[${MEAL_ROW_ATTRIBUTE}="${CSS.escape(meal.id)}"]`);
        return focusAfterRowRemoval(row ?? null, actionRef.current);
      },
    };
  }

  return (
    <PageContainer clearToast="full">
      <div ref={pageRef} className="space-y-4">
        <div
          role="tablist"
          aria-label={tSegments("label")}
          data-recipes-segments=""
          className={`${segmentedTray} ${segmentedTrayFieldHeight} grid-cols-3`}
        >
          {SEGMENTS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${searchId}-${key}-tab`}
              aria-selected={segment === key}
              aria-controls={`${searchId}-panel`}
              onClick={() => choose(key)}
              {...roving.optionProps(key)}
              className={`${segmentButton} ${segmentButtonFieldHeight} ${segment === key ? segmentActive : segmentInactive}`}
            >
              {tSegments(key)}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${searchId}-panel`}
          aria-labelledby={`${searchId}-${segment}-tab`}
          className="space-y-4"
        >
          <button
            ref={actionRef}
            type="button"
            data-recipes-action=""
            onClick={(e) => {
              opened();
              if (segment === "recipes") recipeEditor.open(e.currentTarget);
              else if (segment === "meals") mealSheet.open(e.currentTarget, null);
              else ownSheet.open(e.currentTarget, null);
            }}
            className={btnWide}
          >
            {{ recipes: tLists("newRecipe"), meals: tLists("newMeal"), foods: tLists("newFood") }[segment]}
          </button>
          <div data-recipes-search-row="" className={fieldWithButtonRow}>
            <div className={fieldWithButtonField}>
              <SearchField
                key={segment}
                id={searchId}
                inputRef={searchRef}
                value={query}
                onChange={setQuery}
                autoFocus={false}
                label={tSearch(segment)}
              />
            </div>
            {segment === "recipes" && (
              <RecipeFilterButton
                inForce={filterCount(filter)}
                onOpen={(opener) => {
                  opened();
                  filterSheet.open(opener);
                }}
              />
            )}
          </div>
          <div className="pt-2">
            {segment === "recipes" ? (
              <RecipeList
                query={query}
                onClearQuery={clearQuery}
                newRecipe={actionRef}
                arrival={arrival}
                filter={filter}
                onFilter={setFilter}
              />
            ) : segment === "meals" ? (
              <SavedMealsSection
                onOpenMeal={(meal, opener) => {
                  opened();
                  mealSheet.open(opener, meal);
                }}
                archivedOpen={archivedOpen}
                onToggleArchived={() => setArchivedOpen((open) => !open)}
                onRestore={(meal) => void meals.setArchived(meal, false).then((outcome) => sayIfFailed(outcome, say))}
                busyId={meals.busyId}
                held={holding}
                rowDescription={rowOpens}
                query={query}
                onClearQuery={clearQuery}
              />
            ) : (
              <OwnFoodsSection
                onOpenFood={(food, opener) => void openFood(food, opener)}
                openingId={openingId}
                rowDescription={rowOpens}
                query={query}
                onClearQuery={clearQuery}
              />
            )}
          </div>
        </div>
      </div>
      {filterSheet.shown && (
        <RecipeFilterSheet
          key={`filter-${filterSheet.shown.key}`}
          open={filterSheet.isOpen}
          returnFocusTo={filterSheet.shown.opener}
          onClose={filterSheet.close}
          filter={filter}
          onApply={setFilter}
        />
      )}
      {recipeEditor.shown && (
        <RecipeEditorSheet
          key={`recipe-${recipeEditor.shown.key}`}
          open={recipeEditor.isOpen}
          returnFocusTo={recipeEditor.shown.opener}
          onClose={recipeEditor.close}
          onSavedRecipe={(saved) => {
            markOpenedInApp();
            router.push(`/recipes/${saved.id}`);
          }}
        />
      )}
      {mealOpen && (
        <SavedMealSheet
          key={`meal-${mealOpen.key}`}
          open={mealSheet.isOpen}
          returnFocusTo={mealOpen.opener}
          onClose={mealSheet.close}
          sources={sources}
          {...(mealOpen.value ? editMeal(mealOpen.value) : { kind: "new" as const, initialName: "" })}
        />
      )}
      {ownSheet.shown && (
        <OwnFoodSheet
          key={`own-${ownSheet.shown.key}`}
          open={ownSheet.isOpen}
          returnFocusTo={ownSheet.shown.opener}
          onClose={ownSheet.close}
          food={ownSheet.shown.value ?? undefined}
          onFoodGone={foodGone}
          focusAfterDelete={() => focusAfterRowRemoval(ownSheet.shown?.opener ?? null, actionRef.current)}
        />
      )}
    </PageContainer>
  );
}
