"use client";

import { OwnFoodSheet } from "@/components/foods/OwnFoodSheet";
import { sourcesOf } from "@/components/log/mealFilter";
import { MEAL_ROW_ATTRIBUTE } from "@/components/log/SavedMealRow";
import { SavedMealSheet, type EditSavedMeal } from "@/components/log/SavedMealSheet";
import { sayIfFailed, useMealActions } from "@/components/log/useMealActions";
import { PageContainer } from "@/components/ui/PageContainer";
import { actionPair, actionPairButton } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { afterFoodGone, afterSavedMealGone } from "@/lib/invalidation";
import { STALE } from "@/lib/queryClient";
import { foodDetailQuery, savedMealsQuery } from "@/lib/queryOptions";
import type { FoodDetail, FoodSummary, SavedMeal } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState, type ReactElement } from "react";
import { OwnFoodsSection } from "./OwnFoodsSection";
import { SavedMealsSection } from "./SavedMealsSection";

// ---------------------------------------------------------------------------
// RecipesTab: where a person keeps their saved meals and their own foods.
// One row of two actions at the top, "New saved meal" and "Add a food", so
// each is in the same place however long the lists are. Then the saved meals
// with the archived ones under them, then the own foods. A row opens its edit
// sheet directly: this page keeps things, and the log sheet logs them.
//
// - The sheets are the log sheet's own, top-level here: `SavedMealSheet`
//   without `logging` (save only) and with `archive`, and `OwnFoodSheet`.
//   Each delete confirmation is stacked on its own sheet.
// - The lists read the same cached queries as the log sheet, and every
//   write edits them, so a change in either place shows in the other.
// - A food row opens its sheet at once on the food's cached detail when it
//   is fresh, and offline on any cached detail. Otherwise it reads the
//   detail first, and the row shows it is busy meanwhile. Any other open while that read is out wins, and the read's
//   answer is dropped, so one sheet opens, the last one asked for. A failed
//   read shows as a toast, since no sheet is open.
// - Writes wait while the app asks the server for today, as on the Day tab.
// - After a delete, focus goes to the next row of that list, else the row
//   before, else that list's action at the top.
// ---------------------------------------------------------------------------

export function RecipesTab(): ReactElement {
  const t = useTranslations("recipes");
  const tBrowse = useTranslations("log.browse");
  const tFoods = useTranslations("foods.sheet");
  const tLog = useTranslations("log");
  const errors = useErrorCopy();
  const offlineLine = useFailureLine("form");
  const client = useQueryClient();
  const toast = useToast();
  const offline = useKnownOffline();
  const { holding } = useToday();

  const pageRef = useRef<HTMLDivElement>(null);
  const newMealRef = useRef<HTMLButtonElement>(null);
  const addFoodRef = useRef<HTMLButtonElement>(null);
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
    const fresh = state !== undefined && !state.isInvalidated && Date.now() - state.dataUpdatedAt < STALE.live;
    if (cached && (fresh || offline)) {
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
        return focusAfterRowRemoval(row ?? null, newMealRef.current);
      },
    };
  }

  return (
    <PageContainer clearToast>
      <div ref={pageRef} className="space-y-8">
        <div data-recipes-actions="" className={actionPair}>
          <button
            ref={newMealRef}
            type="button"
            onClick={(e) => {
              opened();
              mealSheet.open(e.currentTarget, null);
            }}
            className={actionPairButton}
          >
            {tBrowse("newMeal")}
          </button>
          <button
            ref={addFoodRef}
            type="button"
            onClick={(e) => {
              opened();
              ownSheet.open(e.currentTarget, null);
            }}
            className={actionPairButton}
          >
            {t("addFood")}
          </button>
        </div>
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
        />
        <OwnFoodsSection
          onOpenFood={(food, opener) => void openFood(food, opener)}
          openingId={openingId}
          rowDescription={rowOpens}
        />
      </div>
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
          focusAfterDelete={() => focusAfterRowRemoval(ownSheet.shown?.opener ?? null, addFoodRef.current)}
        />
      )}
    </PageContainer>
  );
}
