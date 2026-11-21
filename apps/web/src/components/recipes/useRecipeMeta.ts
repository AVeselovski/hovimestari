"use client";

import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

/** How a recipe's servings and time read, "Serves 2 · 25 min", and its figures per serving. */
export function useRecipeMeta(): {
  serves: (recipe: Pick<RecipeSummary, "servings" | "timeMinutes">) => string;
  figures: (recipe: Pick<RecipeSummary, "perServing">) => string;
} {
  const t = useTranslations("recipes.list");
  const serves = useCallback(
    (r: Pick<RecipeSummary, "servings" | "timeMinutes">) =>
      r.timeMinutes === null
        ? t("serves", { servings: r.servings })
        : t("servesTime", { servings: r.servings, minutes: r.timeMinutes }),
    [t],
  );
  const figures = useCallback(
    (r: Pick<RecipeSummary, "perServing">) =>
      t("figures", { kcal: formatKcal(r.perServing.energyKcal), protein: formatMacroGrams(r.perServing.proteinG) }),
    [t],
  );
  return useMemo(() => ({ serves, figures }), [serves, figures]);
}
