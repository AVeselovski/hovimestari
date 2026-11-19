"use client";

import { FoodRow } from "@/components/foods/FoodRow";
import { fieldHintClass, listLine, listLineFrame, sectionTitle } from "@/components/ui/styles";
import { ownFoodsQuery } from "@/lib/queryOptions";
import type { FoodSummary } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// OwnFoodsSection: the Recipes tab's own foods, by name, each row with its
// energy and protein per 100 g and the star of a favourite, opening its edit
// sheet. Every row here is the user's own, so the rows leave "Yours" out.
// While the list loads it keeps one line's room (`listLineFrame`). An empty
// list and a list that cannot be read each say so in a line. A row whose
// food is being read to open its sheet shows it is busy.
// ---------------------------------------------------------------------------

const PAGE_FOODS_LIST = "recipes-foods";

export interface OwnFoodsSectionProps {
  onOpenFood: (food: FoodSummary, opener: HTMLElement) => void;
  /** The id of the food whose detail is being read to open its sheet, or null. */
  openingId: string | null;
  /** What a row's press does, for assistive tech. */
  rowDescription: string;
}

export function OwnFoodsSection({ onOpenFood, openingId, rowDescription }: OwnFoodsSectionProps): ReactElement {
  const t = useTranslations("recipes");
  const tFoods = useTranslations("foods.sheet");
  const id = useId();
  const query = useQuery(ownFoodsQuery());
  const foods = query.data?.foods;
  const unavailable = foods === undefined && (query.isError || query.fetchStatus === "paused");
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`${sectionTitle} mb-1`}>
        {tFoods("ownFoods")}
      </h2>
      {foods === undefined ? (
        <div className={listLineFrame}>{unavailable && <p className={fieldHintClass}>{t("foodsUnavailable")}</p>}</div>
      ) : foods.length === 0 ? (
        <p className={listLine}>{tFoods("ownFoodsEmpty")}</p>
      ) : (
        <ul data-list={PAGE_FOODS_LIST}>
          {foods.map((food) => (
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
