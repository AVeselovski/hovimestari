"use client";

import { useConfirmedDelete, type ConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { deleteSavedMeal } from "@/lib/api/savedMeals";
import { getErrorCode } from "@/lib/errors";
import { afterSavedMealGone } from "@/lib/invalidation";
import type { SavedMeal } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// useSavedMealDelete: the one delete of a saved meal, behind every control
// that offers it (the log sheet's meal view and the meal's edit sheet). It
// asks first, with the meal view's words. A meal already gone, deleted on
// another device, counts as done, since what the user asked for is true.
// Then the meal leaves every cached list (`afterSavedMealGone`), and the
// host does what its own view needs (`onDone`).
// ---------------------------------------------------------------------------

export interface SavedMealDeleteOptions {
  /** After the delete worked and the lists dropped the meal, in the update that closes the confirmation. */
  onDone: (meal: SavedMeal) => void;
  /** Where focus goes after the delete, as `useConfirmedDelete` takes it. Default: its own rule. */
  focusAfter?: (opener: HTMLElement | null, meal: SavedMeal) => HTMLElement | null;
}

export function useSavedMealDelete({ onDone, focusAfter }: SavedMealDeleteOptions): ConfirmedDelete<SavedMeal> {
  const t = useTranslations("log.meal");
  const client = useQueryClient();
  return useConfirmedDelete<SavedMeal>({
    copy: (meal) => ({ title: t("deleteTitle", { name: meal.name }), message: t("deleteBody") }),
    run: (meal) =>
      deleteSavedMeal(meal.id).catch((err: unknown) => {
        if (getErrorCode(err) !== "saved_meal_not_found") throw err;
      }),
    onDone: (_result, meal) => {
      void afterSavedMealGone(client, meal.id);
      onDone(meal);
    },
    focusAfter,
  });
}
