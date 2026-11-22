"use client";

import { FoodRow } from "@/components/foods/FoodRow";
import { fieldHintClass, sectionTitle } from "@/components/ui/styles";
import { recentsQuery } from "@/lib/queryOptions";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { AgainButton } from "./AgainButton";
import { foodAgainItem, mealAgainItem, recipeAgainItem } from "./againItems";
import { useAmountLabels } from "./amountLabel";
import type { BrowseLogging } from "./browseLogging";
import { useHeldList, useListsReady } from "./heldList";
import { LogRecipeRow } from "./RecipeRows";
import { SavedMealRow } from "./SavedMealRow";

// ---------------------------------------------------------------------------
// RecentList: the foods, saved meals and recipes eaten most recently, newest
// first, up to 12, each with "Last 200 g" and the "+" that logs it again with
// that amount. A food opens its food view, a meal its meal view and a recipe
// its recipe view. While the list
// loads only its title shows, as the other lists do. The Day tab reads it
// ahead, so the sheet normally opens with it. Its order holds while it can
// be pressed (heldList.tsx).
// ---------------------------------------------------------------------------

export function RecentList({ logging }: { logging: BrowseLogging }): ReactElement {
  const t = useTranslations("log.browse");
  const labels = useAmountLabels();
  const recents = useQuery(recentsQuery());
  // The order this list showed holds while it can be pressed (heldList.tsx).
  const items = useHeldList(recents.data?.items, (item) =>
    item.kind === "food"
      ? `food-${item.food.id}`
      : item.kind === "recipe"
        ? `recipe-${item.recipe.id}`
        : `meal-${item.meal.id}`,
  );
  // Its line waits for the other lists, as its rows do.
  const unavailable = useListsReady() && items === undefined && (recents.isError || recents.fetchStatus === "paused");
  return (
    <section aria-label={t("recent")} data-list="recent">
      <h3 className={`${sectionTitle} mb-1`}>{t("recent")}</h3>
      {items === undefined ? (
        unavailable && <p className={fieldHintClass}>{t("recentUnavailable")}</p>
      ) : items.length === 0 ? (
        <p className="py-3 text-base text-ink-muted">{t("recentEmpty")}</p>
      ) : (
        <ul>
          {items.map((item) => {
            if (item.kind === "food") {
              const again = foodAgainItem(item.food, item.last, labels);
              return (
                <FoodRow
                  key={`food-${item.food.id}`}
                  food={item.food}
                  meta={t("last", { amount: again.amount })}
                  onOpen={(food, opener) => logging.onOpenFood(food, opener, item.last)}
                  trailing={<AgainButton item={again} logging={logging} />}
                />
              );
            }
            if (item.kind === "recipe") {
              const again = recipeAgainItem(item.recipe, item.last.servings, labels);
              return (
                <LogRecipeRow
                  key={`recipe-${item.recipe.id}`}
                  recipe={item.recipe}
                  meta={
                    <span className="mt-1 block text-sm break-words text-ink-muted">
                      {t("last", { amount: again.amount })}
                    </span>
                  }
                  onOpen={(recipe, opener) => logging.onOpenRecipe(recipe, opener, item.last.servings)}
                  trailing={<AgainButton item={again} logging={logging} />}
                />
              );
            }
            const again = mealAgainItem(item.meal, item.last.count, labels);
            return (
              <SavedMealRow
                key={`meal-${item.meal.id}`}
                meal={item.meal}
                meta={t("last", { amount: again.amount })}
                onOpen={(meal, opener) => logging.onOpenMeal(meal, opener, item.last.count)}
                trailing={<AgainButton item={again} logging={logging} />}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
