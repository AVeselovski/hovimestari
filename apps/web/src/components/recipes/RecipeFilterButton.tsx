"use client";

import { Icon } from "@/components/Icon";
import { cornerBadge, iconButtonBesideField, iconButtonOff, iconButtonOn } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// RecipeFilterButton: Filter, the icon button after the recipes' search
// field. A square as tall as the field. It opens the filter sheet. Plain
// while the list is by name with no bound. While a bound or another order is
// in force it is in the accent, with the count of them on its corner. The
// count hangs outside the button's flow, so the button is one box with and
// without it. Its name is "Filter", or "Filter, 2 on".
// ---------------------------------------------------------------------------

export interface RecipeFilterButtonProps {
  /** How many bounds and orders other than by name are in force. */
  inForce: number;
  /** Opens the filter sheet, with this button as its opener. */
  onOpen: (opener: HTMLElement) => void;
}

export function RecipeFilterButton({ inForce, onOpen }: RecipeFilterButtonProps): ReactElement {
  const t = useTranslations("recipes.list");
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={inForce > 0 ? t("filterSaid", { count: inForce }) : t("filter")}
      title={t("filter")}
      data-recipe-filter=""
      onClick={(e) => onOpen(e.currentTarget)}
      className={`${iconButtonBesideField} ${inForce > 0 ? iconButtonOn : iconButtonOff}`}
    >
      <Icon name="filter" className="size-6" />
      {inForce > 0 && (
        <span aria-hidden="true" data-recipe-filter-count="" className={cornerBadge}>
          {inForce}
        </span>
      )}
    </button>
  );
}
