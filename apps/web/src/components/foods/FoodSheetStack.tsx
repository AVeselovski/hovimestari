"use client";

import { EstimateSheet } from "@/components/log/EstimateSheet";
import { SavedMealSheet } from "@/components/log/SavedMealSheet";
import type { AddDone, EntryActions } from "@/hooks/entryActions";
import type { SheetTarget } from "@/hooks/useSheetTarget";
import type { Portion, SavedMeal } from "@hovimestari/types";
import type { ReactElement, ReactNode } from "react";
import { PortionSheet } from "./PortionSheet";

// ---------------------------------------------------------------------------
// FoodSheetStack: every sheet stacked on the log sheet, in one place, so the
// log sheet itself holds its views and nothing else: the food search's own
// sheets (the barcode scanner and the own-food form, from `useFoodFinder`),
// the portion form, the saved meal and estimate forms, and the delete
// confirmations.
// Each sheet is kept mounted while it slides out, from the `useSheetTarget`
// the log sheet owns and passes in. Rendered in the log sheet's `stacked`
// slot, so each is a nested sheet and the log sheet recedes behind it.
// ---------------------------------------------------------------------------

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
  /** The meal sheet deleted its meal and has closed itself. */
  onMealDeleted: (id: string) => void;
}

export interface FoodSheetStackProps {
  /** The food search's scanner and own-food sheets, `useFoodFinder`'s `stacked`. */
  finder: ReactElement;
  portionSheet: SheetTarget<PortionTarget>;
  mealSheet: SheetTarget<MealSheetTarget>;
  /** The estimate sheet, opened on a name to start from. */
  estimateSheet: SheetTarget<string>;
  logging: StackLogging;
  /** The delete confirmations, from `useConfirmedDelete`. */
  confirmation: ReactNode;
  /** The food a stacked sheet works on turned out to be gone. */
  onFoodGone: (id: string) => void;
  /** Where focus goes after a portion is deleted. */
  focusAfterPortionDelete: () => HTMLElement | null;
}

export function FoodSheetStack({
  finder,
  portionSheet,
  mealSheet,
  estimateSheet,
  logging,
  confirmation,
  onFoodGone,
  focusAfterPortionDelete,
}: FoodSheetStackProps): ReactElement {
  return (
    <>
      {finder}
      {portionSheet.shown && (
        <PortionSheet
          key={`portion-${portionSheet.shown.key}`}
          open={portionSheet.isOpen}
          returnFocusTo={portionSheet.shown.opener}
          onClose={portionSheet.close}
          foodId={portionSheet.shown.value.foodId}
          portion={portionSheet.shown.value.portion}
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
          sources={logging.sources}
          onSavedMeal={logging.onSavedMeal}
          {...(mealSheet.shown.value.meal
            ? {
                kind: "edit" as const,
                meal: mealSheet.shown.value.meal,
                onGone: logging.onMealGone,
                onDeleted: logging.onMealDeleted,
              }
            : {
                kind: "new" as const,
                initialName: mealSheet.shown.value.name,
                logging: { date: logging.date, actions: logging.actions, onLogged: logging.onLogged },
              })}
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
