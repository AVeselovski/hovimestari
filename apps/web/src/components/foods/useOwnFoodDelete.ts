"use client";

import { useConfirmedDelete, type ConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { deleteFood } from "@/lib/api/foods";
import { getErrorCode } from "@/lib/errors";
import { afterFoodGone } from "@/lib/invalidation";
import type { FoodSummary } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// useOwnFoodDelete: the one delete of the user's own food, behind every
// control that offers it (the log sheet's food view and the own-food sheet).
// It asks first. A food already gone, deleted on another device, counts as
// done, since what the user asked for is true. Then the food leaves every
// cached list (`afterFoodGone`), and the host does what its own view needs
// (`onDone`).
// ---------------------------------------------------------------------------

export interface OwnFoodDeleteOptions<F extends FoodSummary> {
  /** After the delete worked and the lists dropped the food, in the update that closes the confirmation. */
  onDone: (food: F) => void;
  /** Where focus goes after the delete, as `useConfirmedDelete` takes it. Default: its own rule. */
  focusAfter?: (opener: HTMLElement | null, food: F) => HTMLElement | null;
}

export function useOwnFoodDelete<F extends FoodSummary>({
  onDone,
  focusAfter,
}: OwnFoodDeleteOptions<F>): ConfirmedDelete<F> {
  const t = useTranslations("foods.detail");
  const client = useQueryClient();
  return useConfirmedDelete<F>({
    copy: (food) => ({ title: t("deleteTitle", { name: food.name }), message: t("deleteBody") }),
    run: (food) =>
      deleteFood(food.id).catch((err: unknown) => {
        if (getErrorCode(err) !== "food_not_found") throw err;
      }),
    onDone: (_result, food) => {
      void afterFoodGone(client, food.id);
      onDone(food);
    },
    focusAfter,
  });
}
