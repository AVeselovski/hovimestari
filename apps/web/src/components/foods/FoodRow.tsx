"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { foodNameLangs, useFoodNameLanguage } from "@/hooks/useFoodNameLanguage";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { FoodSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// FoodRow: one food in a list, a button that opens its detail. The name in
// the user's food-name language, the other language's name under it when it
// differs, then the energy and protein per 100 g in the monospaced face. A
// star marks a favourite and "Yours" an own food. At least 56px tall, and a
// long name wraps, hyphenated in its own language, rather than running out
// of the row. The star's column is always there, so starring a food never
// narrows its text and never moves a row below it.
// ---------------------------------------------------------------------------

export interface FoodRowProps {
  food: FoodSummary;
  onOpen: (food: FoodSummary, opener: HTMLElement) => void;
}

/** The attribute a row's button carries, so focus can find it again after the detail closes. */
export const FOOD_ROW_ATTRIBUTE = "data-food-row";

export function FoodRow({ food, onOpen }: FoodRowProps): ReactElement {
  const t = useTranslations("foods.row");
  const lang = foodNameLangs(food, useFoodNameLanguage());
  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        type="button"
        {...{ [FOOD_ROW_ATTRIBUTE]: food.id }}
        onClick={(e) => onOpen(food, e.currentTarget)}
        className={`flex min-h-14 w-full items-start gap-3 py-3 text-left hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span lang={lang.name} className="block text-base font-medium break-words hyphens-auto text-ink">
            {food.name}
          </span>
          {food.otherName !== null && (
            <span lang={lang.other} className="mt-0.5 block text-sm break-words hyphens-auto text-ink-muted">
              {food.otherName}
            </span>
          )}
          <span className="mt-1 block font-mono text-sm text-ink-muted tabular-nums">
            {t("figures", {
              kcal: formatKcal(food.per100g.energyKcal),
              protein: formatMacroGrams(food.per100g.proteinG),
            })}
          </span>
        </span>
        <span data-food-row-marks="" className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className={`size-5 text-accent${food.isFavourite ? "" : " invisible"}`}>
            {food.isFavourite && (
              <>
                <Icon name="star" filled className="size-5" />
                <span className="sr-only">{t("favourite")}</span>
              </>
            )}
          </span>
          {food.isOwn && <span className="section-label">{t("yours")}</span>}
        </span>
      </button>
    </li>
  );
}
