"use client";

import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { formatCount } from "@/lib/entryFormat";
import { formatGrams } from "@/lib/foodFormat";
import type { FineliPortionUnit, IngredientUnit } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { DraftWritten } from "./recipeDraft";

/** What a line's amount reads from: its grams, a portion count, the recipe's own words. */
export interface LineAmountParts {
  grams: number | null;
  portion: { unit: FineliPortionUnit | null; name: string | null; count: number } | null;
  written: DraftWritten | null;
}

/**
 * How a line's amount reads, in the mono face of the amount column: a
 * portion count with its weight ("4 × Medium piece · 240 g"), the recipe's
 * own words with the weight ("2 cloves · 10 g"), the weight alone ("400 g"),
 * or for a line not counted its own words alone ("1 pinch"), else nothing.
 */
export function useLineAmount(): (line: LineAmountParts) => string {
  const tRow = useTranslations("day.row");
  const written = useWrittenAmount();
  const portionLabel = usePortionChipLabel();
  return useCallback(
    (line: LineAmountParts) => {
      if (line.grams === null) return line.written ? written(line.written) : "";
      const grams = formatGrams(line.grams);
      if (line.portion) {
        return tRow("portion", { count: formatCount(line.portion.count), portion: portionLabel(line.portion), grams });
      }
      if (line.written) return `${written(line.written)} · ${tRow("grams", { grams })}`;
      return tRow("grams", { grams });
    },
    [portionLabel, tRow, written],
  );
}

/** The recipe's own words for an amount: "2 cloves", "1.5 dl". */
export function useWrittenAmount(): (written: DraftWritten) => string {
  const t = useTranslations("recipes.units");
  return useCallback((w: DraftWritten) => t(w.unit as IngredientUnit, { count: w.amount }), [t]);
}
