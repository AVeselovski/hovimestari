"use client";

import { EstimateSheet } from "@/components/log/EstimateSheet";
import { SavedMealSheet } from "@/components/log/SavedMealSheet";
import type { AddDone, EntryActions } from "@/hooks/entryActions";
import type { SheetTarget } from "@/hooks/useSheetTarget";
import type { FoodDetail, Portion, SavedMeal } from "@hovimestari/types";
import type { ReactElement, ReactNode } from "react";
import { OwnFoodSheet } from "./OwnFoodSheet";
import { PortionSheet } from "./PortionSheet";

// ---------------------------------------------------------------------------
// FoodSheetStack: every sheet stacked on the log sheet, in one place, so the
// log sheet itself holds its views and nothing else: the own-food and portion
// forms, the saved meal and estimate forms, and the delete confirmations. Each sheet is kept
// mounted while it slides out, from the `useSheetTarget` the log sheet owns
// and passes in. Rendered in the log sheet's `stacked` slot, so each is a
// nested sheet and the log sheet recedes behind it.
// ---------------------------------------------------------------------------

/** What the own-food sheet opens on: a food to edit, or a name to start a new one from. */
export interface OwnFoodTarget {
  food?: FoodDetail;
  name: string;
}

/** What the portion sheet opens on: the food, and a portion to edit or none for a new one. */
export interface PortionTarget {
  foodId: string;
  portion?: Portion;
}

/** What the saved meal sheet opens on: a meal to edit, or a name to start a new one from. */
export interface MealSheetTarget {
  meal?: SavedMeal;
  name: string;
}

/** What the saved meal and estimate sheets share with the log sheet. */
export interface StackLogging {
  /** The log sheet's date. */
  date: string;
  actions: Pick<EntryActions, "add" | "saveAndLog" | "withdrawAdd" | "holding">;
  /** The sources of the user's meals. */
  sources: readonly string[];
  /** A stacked sheet logged: both sheets close in this update. */
  onLogged: (done: AddDone) => void;
  /** A meal was saved without logging. */
  onSavedMeal: (meal: SavedMeal) => void;
  /** The meal a stacked sheet works on is gone. */
  onMealGone: (id: string) => void;
}

export interface FoodSheetStackProps {
  ownSheet: SheetTarget<OwnFoodTarget>;
  portionSheet: SheetTarget<PortionTarget>;
  mealSheet: SheetTarget<MealSheetTarget>;
  /** The estimate sheet, opened on a name to start from. */
  estimateSheet: SheetTarget<string>;
  logging: StackLogging;
  /** The delete confirmations, from `useConfirmedDelete`. */
  confirmation: ReactNode;
  /** An own food was saved. */
  onSavedFood: (food: FoodDetail) => void;
  /** The own food open in the own-food sheet was deleted from it. */
  onDeletedFood: (id: string) => void;
  /** The food a stacked sheet works on turned out to be gone. */
  onFoodGone: (id: string) => void;
  /** Where focus goes after a portion is deleted. */
  focusAfterPortionDelete: () => HTMLElement | null;
}

export function FoodSheetStack({
  ownSheet,
  portionSheet,
  mealSheet,
  estimateSheet,
  logging,
  confirmation,
  onSavedFood,
  onDeletedFood,
  onFoodGone,
  focusAfterPortionDelete,
}: FoodSheetStackProps): ReactElement {
  return (
    <>
      {ownSheet.shown && (
        <OwnFoodSheet
          key={`own-${ownSheet.shown.key}`}
          open={ownSheet.isOpen}
          returnFocusTo={ownSheet.shown.opener}
          onClose={ownSheet.close}
          food={ownSheet.shown.value.food}
          initialName={ownSheet.shown.value.name}
          onSavedFood={onSavedFood}
          onDeleted={onDeletedFood}
          onFoodGone={onFoodGone}
        />
      )}
      {portionSheet.shown && (
        <PortionSheet
          key={`portion-${portionSheet.shown.key}`}
          open={portionSheet.isOpen}
          returnFocusTo={portionSheet.shown.opener}
          onClose={portionSheet.close}
          foodId={portionSheet.shown.value.foodId}
          portion={portionSheet.shown.value.portion}
          onDeleted={portionSheet.close}
          onFoodGone={onFoodGone}
          focusAfterDelete={focusAfterPortionDelete}
        />
      )}
      {mealSheet.shown && (
        <SavedMealSheet
          key={`meal-${mealSheet.shown.key}`}
          open={mealSheet.isOpen}
          returnFocusTo={mealSheet.shown.opener}
          onClose={mealSheet.close}
          meal={mealSheet.shown.value.meal}
          initialName={mealSheet.shown.value.name}
          date={logging.date}
          sources={logging.sources}
          actions={logging.actions}
          onLogged={logging.onLogged}
          onSavedMeal={logging.onSavedMeal}
          onGone={logging.onMealGone}
        />
      )}
      {estimateSheet.shown && (
        <EstimateSheet
          key={`estimate-${estimateSheet.shown.key}`}
          open={estimateSheet.isOpen}
          returnFocusTo={estimateSheet.shown.opener}
          onClose={estimateSheet.close}
          initialName={estimateSheet.shown.value}
          date={logging.date}
          actions={logging.actions}
          onLogged={logging.onLogged}
        />
      )}
      {confirmation}
    </>
  );
}
