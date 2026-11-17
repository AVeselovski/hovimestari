import type { FoodSummary, LastAmount, SavedMeal } from "@hovimestari/types";
import type { AmountLabels } from "./amountLabel";
import type { LogAgainItem } from "./useLogAgain";

// What "+" adds for a food or a saved meal: its last amount. A food's
// portion count when the portion still exists (`id` set), else its grams.

export function foodAgainItem(food: FoodSummary, last: LastAmount, labels: AmountLabels): LogAgainItem {
  const portionId = last.portion?.id ?? null;
  return {
    kind: "food",
    sourceId: food.id,
    name: food.name,
    amount: labels.food(last),
    body: (id, date, status) => ({
      kind: "food",
      id,
      date,
      status,
      foodId: food.id,
      amount: portionId !== null && last.portion ? { portionId, count: last.portion.count } : { grams: last.grams },
    }),
  };
}

export function mealAgainItem(meal: SavedMeal, count: number, labels: AmountLabels): LogAgainItem {
  return {
    kind: "saved_meal",
    sourceId: meal.id,
    name: meal.name,
    amount: labels.meals(count),
    body: (id, date, status) => ({ kind: "saved_meal", id, date, status, savedMealId: meal.id, count }),
  };
}
