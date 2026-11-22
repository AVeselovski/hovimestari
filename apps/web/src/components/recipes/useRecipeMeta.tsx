"use client";

import { midDot } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, type ReactNode } from "react";

/**
 * How a recipe's servings and time read, "Serves 2 · 25 min", and its figures per serving. The room around the
 * dot is the dot's own margin (`midDot`), so the catalog holds plain spaces and no character nobody can see.
 */
export function useRecipeMeta(): {
  serves: (recipe: Pick<RecipeSummary, "servings" | "timeMinutes">) => ReactNode;
  figures: (recipe: Pick<RecipeSummary, "perServing">) => string;
} {
  const t = useTranslations("recipes.list");
  const serves = useCallback(
    (r: Pick<RecipeSummary, "servings" | "timeMinutes">) =>
      r.timeMinutes === null
        ? t("serves", { servings: r.servings })
        : t.rich("servesTime", {
            servings: r.servings,
            minutes: r.timeMinutes,
            dot: (chunks) => <span className={midDot}>{chunks}</span>,
          }),
    [t],
  );
  const figures = useCallback(
    (r: Pick<RecipeSummary, "perServing">) =>
      t("figures", { kcal: formatKcal(r.perServing.energyKcal), protein: formatMacroGrams(r.perServing.proteinG) }),
    [t],
  );
  return useMemo(() => ({ serves, figures }), [serves, figures]);
}
