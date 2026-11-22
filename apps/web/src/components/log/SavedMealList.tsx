"use client";

import { btnText, fieldHintClass, sectionTitle } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { savedMealsQuery } from "@/lib/queryOptions";
import type { SavedMeal } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { AgainButton } from "./AgainButton";
import { mealAgainItem } from "./againItems";
import { useAmountLabels } from "./amountLabel";
import type { BrowseLogging } from "./browseLogging";
import { useHeldList, useListsReady } from "./heldList";
import { activeSource, mealFilter, sourcesOf } from "./mealFilter";
import { SavedMealRow } from "./SavedMealRow";
import { SourceChips } from "./SourceChips";

// ---------------------------------------------------------------------------
// SavedMealList: the log sheet's "Saved meals" while browsing. The active
// meals by name, each with its figures per meal and a "+" that logs it with
// its last count, else 1 meal. The source chips sit above them when the
// meals name two sources or more, and the chosen one keeps its meals alone.
// "Archived meals" sits under the list, always, so no archived list is read
// to decide it. While the list loads only its title shows. The Day tab reads
// it ahead, so the sheet normally opens with it.
// ---------------------------------------------------------------------------

/** The attribute "Archived meals" carries, so Back from the archived view puts focus on it again. */
export const ARCHIVED_ATTRIBUTE = "data-archived-meals";

export interface SavedMealListProps {
  logging: BrowseLogging;
  /** The chosen source, kept by the sheet, so the results filter by it too. */
  source: string | null;
  onSource: (source: string | null) => void;
  onArchived: (opener: HTMLElement) => void;
  /** The list cannot be read and nothing else says so already: say it here. */
  sayUnavailable: boolean;
}

/** The figures line of a saved meal row, per meal. */
export function useMealFigures(): (meal: SavedMeal) => string {
  const t = useTranslations("log.browse");
  return (meal) =>
    t("mealFigures", { kcal: formatKcal(meal.figures.energyKcal), protein: formatMacroGrams(meal.figures.proteinG) });
}

/** Saved meal rows, each with its figures per meal and a "+" that logs its last count, else 1 meal. */
export function MealRows({ meals, logging }: { meals: readonly SavedMeal[]; logging: BrowseLogging }): ReactElement {
  const labels = useAmountLabels();
  const figures = useMealFigures();
  return (
    <ul>
      {meals.map((meal) => (
        <SavedMealRow
          key={meal.id}
          meal={meal}
          meta={figures(meal)}
          metaFigures
          onOpen={(m, opener) => logging.onOpenMeal(m, opener, m.lastCount)}
          trailing={<AgainButton item={mealAgainItem(meal, meal.lastCount, labels)} logging={logging} />}
        />
      ))}
    </ul>
  );
}

export function SavedMealList({
  logging,
  source,
  onSource,
  onArchived,
  sayUnavailable,
}: SavedMealListProps): ReactElement {
  const t = useTranslations("log.browse");
  const query = useQuery(savedMealsQuery(false));
  // The order and the chips this list showed hold while it can be pressed (heldList.tsx).
  const meals = useHeldList(query.data?.meals, (meal) => meal.id);
  // Its line waits for the other lists, as its rows do.
  const unavailable = useListsReady() && meals === undefined && (query.isError || query.fetchStatus === "paused");
  const sources = meals ? sourcesOf(meals) : [];
  const chosen = meals ? activeSource(meals, source) : null;
  const shown = meals ? mealFilter(meals, "", chosen) : undefined;
  return (
    <section aria-label={t("savedMeals")} data-list="meals">
      <h3 className={`${sectionTitle} mb-1`}>{t("savedMeals")}</h3>
      {sources.length >= 2 && <SourceChips sources={sources} value={chosen} onChange={onSource} />}
      {shown === undefined ? (
        unavailable && sayUnavailable && <p className={fieldHintClass}>{t("recentUnavailable")}</p>
      ) : shown.length === 0 ? (
        <p className="py-3 text-base text-ink-muted">{t("savedMealsEmpty")}</p>
      ) : (
        <MealRows meals={shown} logging={logging} />
      )}
      <button
        type="button"
        {...{ [ARCHIVED_ATTRIBUTE]: "" }}
        onClick={(e) => onArchived(e.currentTarget)}
        className={`${btnText} mt-1`}
      >
        {t("archived")}
      </button>
    </section>
  );
}
