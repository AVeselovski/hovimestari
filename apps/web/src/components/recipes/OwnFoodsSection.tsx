"use client";

import { FoodRow } from "@/components/foods/FoodRow";
import { btnText, fieldHintClass, listLine, listLineFrame, sectionTitle } from "@/components/ui/styles";
import { ownFoodsQuery } from "@/lib/queryOptions";
import { fold, type FoodSummary } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// OwnFoodsSection: the Library's own foods, under "My foods", by name, each
// row with its energy and protein per 100 g and the star of a favourite,
// opening its edit sheet. Every row here is the user's own, so the rows leave
// "Yours" out.
// While the list loads it keeps one line's room (`listLineFrame`). An empty
// list and a list that cannot be read each say so in a line. A row whose
// food is being read to open its sheet shows it is busy. The Foods
// segment's search narrows the list on the device, by every word in a
// food's name, and a search that matches none says so with Clear search.
// ---------------------------------------------------------------------------

const PAGE_FOODS_LIST = "recipes-foods";

export interface OwnFoodsSectionProps {
  onOpenFood: (food: FoodSummary, opener: HTMLElement) => void;
  /** The id of the food whose detail is being read to open its sheet, or null. */
  openingId: string | null;
  /** What a row's press does, for assistive tech. */
  rowDescription: string;
  /** The segment's search, as typed. */
  query?: string;
  /** Empties the segment's search. */
  onClearQuery?: () => void;
}

export function OwnFoodsSection({
  onOpenFood,
  openingId,
  rowDescription,
  query = "",
  onClearQuery,
}: OwnFoodsSectionProps): ReactElement {
  const t = useTranslations("recipes");
  const tLists = useTranslations("lists");
  const tMatch = useTranslations("recipes.noMatch");
  const tFoods = useTranslations("foods.sheet");
  const id = useId();
  const read = useQuery(ownFoodsQuery());
  const foods = read.data?.foods;
  const unavailable = foods === undefined && (read.isError || read.fetchStatus === "paused");
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = foods?.filter((food) => words.every((word) => fold(food.name).includes(word)));
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`${sectionTitle} mb-1`}>
        {tLists("myFoods")}
      </h2>
      {foods === undefined ? (
        <div className={listLineFrame}>{unavailable && <p className={fieldHintClass}>{t("foodsUnavailable")}</p>}</div>
      ) : foods.length === 0 ? (
        <p className={listLine}>{tFoods("ownFoodsEmpty")}</p>
      ) : shown!.length === 0 ? (
        <div className="flex flex-col items-start gap-1 py-3">
          <p className="text-base text-ink">{tMatch("foods")}</p>
          <button type="button" onClick={onClearQuery} className={btnText}>
            {tMatch("clear")}
          </button>
        </div>
      ) : (
        <ul data-list={PAGE_FOODS_LIST}>
          {shown!.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              onOpen={onOpenFood}
              ownMark={false}
              busy={openingId === food.id}
              description={rowDescription}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
