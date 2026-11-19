"use client";

import { Icon } from "@/components/Icon";
import { ArchivedMealsView } from "@/components/log/ArchivedMealsView";
import { useMealFigures } from "@/components/log/SavedMealList";
import { SavedMealRow } from "@/components/log/SavedMealRow";
import { btnText, fieldHintClass, listLine, listLineFrame, sectionTitle } from "@/components/ui/styles";
import { savedMealsQuery } from "@/lib/queryOptions";
import type { SavedMeal } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// SavedMealsSection: the Recipes tab's saved meals. The active meals by name,
// each row with its source and its figures per meal, opening its edit sheet.
// Under them "Archived meals" opens the archived list in place, read on its
// first open, each row with Restore. While the list loads it keeps one
// line's room (`listLineFrame`), the height of the empty list, under the
// heading. An empty list and a list that cannot be read each say so in a
// line. Each row says what a press does (`rowDescription`).
// ---------------------------------------------------------------------------

const PAGE_MEALS_LIST = "recipes-meals";

export interface SavedMealsSectionProps {
  onOpenMeal: (meal: SavedMeal, opener: HTMLElement) => void;
  archivedOpen: boolean;
  onToggleArchived: () => void;
  onRestore: (meal: SavedMeal) => void;
  /** The id of the meal whose archive or restore runs, or null. */
  busyId: string | null;
  /** Writes wait: the app asks the server for today. */
  held: boolean;
  /** What a row's press does, for assistive tech. */
  rowDescription: string;
}

export function SavedMealsSection({
  onOpenMeal,
  archivedOpen,
  onToggleArchived,
  onRestore,
  busyId,
  held,
  rowDescription,
}: SavedMealsSectionProps): ReactElement {
  const t = useTranslations("recipes");
  const tBrowse = useTranslations("log.browse");
  const figures = useMealFigures();
  const id = useId();
  const query = useQuery(savedMealsQuery(false));
  const meals = query.data?.meals;
  const unavailable = meals === undefined && (query.isError || query.fetchStatus === "paused");
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`${sectionTitle} mb-1`}>
        {tBrowse("savedMeals")}
      </h2>
      {meals === undefined ? (
        <div className={listLineFrame}>{unavailable && <p className={fieldHintClass}>{t("mealsUnavailable")}</p>}</div>
      ) : meals.length === 0 ? (
        <p className={listLine}>{tBrowse("savedMealsEmpty")}</p>
      ) : (
        <ul data-list={PAGE_MEALS_LIST}>
          {meals.map((meal) => (
            <SavedMealRow
              key={meal.id}
              meal={meal}
              meta={figures(meal)}
              metaFigures
              onOpen={onOpenMeal}
              description={rowDescription}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-expanded={archivedOpen}
        aria-controls={`${id}-archived`}
        onClick={onToggleArchived}
        className={`${btnText} mt-1 gap-1.5`}
      >
        {tBrowse("archived")}
        <Icon
          name="chevronDown"
          className={`size-5 shrink-0 transition-transform duration-150 motion-reduce:transition-none${archivedOpen ? " rotate-180" : ""}`}
        />
      </button>
      <div id={`${id}-archived`}>
        {archivedOpen && (
          <ArchivedMealsView
            onOpenMeal={onOpenMeal}
            onRestore={onRestore}
            busyId={busyId}
            held={held}
            rowDescription={rowDescription}
          />
        )}
      </div>
    </section>
  );
}
