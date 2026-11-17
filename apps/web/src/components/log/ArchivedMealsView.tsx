"use client";

import { btnSecondary, fieldHintClass } from "@/components/ui/styles";
import { savedMealsQuery } from "@/lib/queryOptions";
import type { SavedMeal } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMealFigures } from "./SavedMealList";
import { SavedMealRow } from "./SavedMealRow";

// ---------------------------------------------------------------------------
// ArchivedMealsView: the log sheet's list of archived meals, under Back and
// "Archived meals" in the header. It reads the archived list when it opens,
// the only place that reads it. Each row opens its meal view, where an
// archived meal can still be logged, and carries "Restore" at its end, which
// takes it off this list and back to the saved meals. While the list loads
// nothing shows under the header.
// ---------------------------------------------------------------------------

export interface ArchivedMealsViewProps {
  onOpenMeal: (meal: SavedMeal, opener: HTMLElement) => void;
  onRestore: (meal: SavedMeal) => void;
  /** The id of the meal whose restore runs, or null. */
  busyId: string | null;
  /** Writes wait: the app asks the server for today. */
  held: boolean;
}

export function ArchivedMealsView({ onOpenMeal, onRestore, busyId, held }: ArchivedMealsViewProps): ReactElement {
  const t = useTranslations("log.archived");
  const figures = useMealFigures();
  const query = useQuery(savedMealsQuery(true));
  const meals = query.data?.meals;
  const unavailable = meals === undefined && (query.isError || query.fetchStatus === "paused");
  if (meals === undefined) {
    return <div data-list="archived">{unavailable && <p className={fieldHintClass}>{t("unavailable")}</p>}</div>;
  }
  if (meals.length === 0) {
    return (
      <div data-list="archived">
        <p className="py-3 text-base text-ink-muted">{t("empty")}</p>
      </div>
    );
  }
  return (
    <ul data-list="archived">
      {meals.map((meal) => {
        const waits = held || busyId !== null;
        return (
          <SavedMealRow
            key={meal.id}
            meal={meal}
            meta={figures(meal)}
            metaFigures
            onOpen={onOpenMeal}
            trailing={
              <button
                type="button"
                aria-label={t("restoreName", { name: meal.name })}
                aria-disabled={waits || undefined}
                aria-busy={busyId === meal.id || undefined}
                onClick={() => {
                  if (!waits) onRestore(meal);
                }}
                className={`${btnSecondary} shrink-0 px-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
              >
                {t("restore")}
              </button>
            }
          />
        );
      })}
    </ul>
  );
}
