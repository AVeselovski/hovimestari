"use client";

import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { formatCount } from "@/lib/entryFormat";
import { formatGrams } from "@/lib/foodFormat";
import type { Entry } from "@hovimestari/types";
import { useTranslations } from "next-intl";

/**
 * An entry's amount line, as its row on the Day tab and its row in the copy
 * sheet show it: "250 g", "2 × Medium piece · 110 g", "1 meal · Foodora",
 * "1.5 servings", or "Estimate". A serving from a batch logged as made reads
 * "1 serving as made" while the batch differs from its recipe as the
 * recipe is now, which the server says (`cook.differs`). A batch made as
 * written reads as the recipe does.
 */
export function useEntryMeta(): (entry: Entry) => string {
  const t = useTranslations("day.row");
  const portionLabel = usePortionChipLabel();
  return (entry) => {
    if (entry.kind === "estimate") return t("estimate");
    if (entry.kind === "recipe") {
      const amount = t("servings", { count: entry.servings ?? 0 });
      // The server says whether the batch differs. The entry's sheet names the batch either way.
      return entry.cook?.differs ? t("asMade", { amount }) : amount;
    }
    if (entry.kind === "saved_meal") {
      const amount = t("meals", { count: entry.count ?? 0 });
      const source = entry.savedMeal?.source;
      return source ? t("withSource", { amount, source }) : amount;
    }
    const grams = formatGrams(entry.grams ?? 0);
    return entry.portion
      ? t("portion", { count: formatCount(entry.portion.count), portion: portionLabel(entry.portion), grams })
      : t("grams", { grams });
  };
}
