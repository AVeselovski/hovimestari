"use client";

import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { formatCount } from "@/lib/entryFormat";
import { formatGrams } from "@/lib/foodFormat";
import type { LastAmount } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

// ---------------------------------------------------------------------------
// How an amount reads in the log sheet and its toasts, in the words a day's
// rows use: "200 g", "2 × Medium piece · 110 g", "1 meal", "1 serving". A last amount
// whose portion is gone (its id is null) reads as its grams, since grams are
// what "+" sends for it.
// ---------------------------------------------------------------------------

export interface AmountLabels {
  /** A food's last amount. */
  food: (last: LastAmount) => string;
  /** A count of meals. */
  meals: (count: number) => string;
  /** A count of a recipe's servings. */
  servings: (count: number) => string;
}

export function useAmountLabels(): AmountLabels {
  const t = useTranslations("day.row");
  const portionLabel = usePortionChipLabel();
  const food = useCallback(
    (last: LastAmount): string => {
      const grams = formatGrams(last.grams);
      return last.portion?.id
        ? t("portion", { count: formatCount(last.portion.count), portion: portionLabel(last.portion), grams })
        : t("grams", { grams });
    },
    [t, portionLabel],
  );
  const meals = useCallback((count: number): string => t("meals", { count }), [t]);
  const servings = useCallback((count: number): string => t("servings", { count }), [t]);
  return useMemo(() => ({ food, meals, servings }), [food, meals, servings]);
}
