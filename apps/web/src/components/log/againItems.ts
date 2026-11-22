import type { FoodSummary, LastAmount, RecipeSummary, SavedMeal } from "@hovimestari/types";
import type { AmountLabels } from "./amountLabel";
import type { LogAgainItem } from "./useLogAgain";

// What "+" adds for a food, a saved meal or a recipe: its last amount. A
// food's portion count when the portion still exists (`id` set), else its
// grams. A recipe's servings, the recipe as written, never a batch of it. A
// saved meal or a recipe never eaten (`null`) adds one, and says so (`first`).

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

export function mealAgainItem(meal: SavedMeal, last: number | null, labels: AmountLabels): LogAgainItem {
  const count = last ?? 1;
  return {
    kind: "saved_meal",
    sourceId: meal.id,
    name: meal.name,
    amount: labels.meals(count),
    first: last === null,
    body: (id, date, status) => ({ kind: "saved_meal", id, date, status, savedMealId: meal.id, count }),
  };
}

export function recipeAgainItem(recipe: RecipeSummary, last: number | null, labels: AmountLabels): LogAgainItem {
  const servings = last ?? 1;
  return {
    kind: "recipe",
    sourceId: recipe.id,
    name: recipe.name,
    amount: labels.servings(servings),
    first: last === null,
    body: (id, date, status) => ({ kind: "recipe", id, date, status, recipeId: recipe.id, servings }),
  };
}
