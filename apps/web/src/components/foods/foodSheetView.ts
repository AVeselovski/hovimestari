import { GRAMS, parseAmount } from "@/components/entries/amount";
import type { LogForm, LogTarget } from "@/components/log/useLogForm";
import type { FoodDetail, FoodSummary, LastAmount, RecipeSummary, SavedMeal } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The log sheet's views (`FoodSheet`) as data, and what each one logs: the
// view on the sheet's navigation stack, the key its log form starts again
// on, its log target, and the amount a food's view hands on to a copy saved
// from it.
//
// - Food: Back, the name and the star in the header. The log block on top,
//   then the food's detail, scrolling. Log in the pinned footer.
// - Meal: Back and the meal's name. The log block with the number of meals,
//   then the meal's figures and Edit, Archive or Restore, Delete. Log in the
//   pinned footer.
// - Recipe: Back and the recipe's name. The log block with the servings, then
//   one serving's figures and Open recipe, which leaves the sheet for the
//   recipe's page and keeps the day's place for the way back. Log in the
//   pinned footer.
// - Archived meals: Back and the title. The archived meals, each with Restore.
//
// A view a press in the lists opens appears under the finger. Its body and
// footer take no press for the half second after (`usePressGuard`), so the
// second tap of a double tap lands on nothing. The amount field takes its tap
// as focus at the pointerdown, which the hold leaves alone. No row sits under
// the header, so Back and the star take a press at once.
// ---------------------------------------------------------------------------

/** A view of the log sheet. */
export type View =
  | { kind: "search" }
  | { kind: "food"; food: FoodSummary; last: LastAmount | null | undefined }
  | { kind: "meal"; meal: SavedMeal; lastCount: number | null }
  | { kind: "recipe"; recipe: RecipeSummary; lastServings: number | null }
  | { kind: "archived" };

/** The key of a view's log form, which starts again when another food, meal or recipe opens. */
export function viewKey(view: View): string {
  if (view.kind === "food") return `food-${view.food.id}`;
  if (view.kind === "meal") return `meal-${view.meal.id}`;
  return view.kind === "recipe" ? `recipe-${view.recipe.id}` : "search";
}

/** What a view's log block logs: the food as its detail has it once loaded. The search and the archived meals log nothing. */
export function logTargetOf(view: View, detail: FoodDetail | undefined): LogTarget | null {
  if (view.kind === "food") return { kind: "food", food: detail ?? view.food, last: view.last, detail };
  if (view.kind === "meal") return { kind: "meal", meal: view.meal, lastCount: view.lastCount };
  if (view.kind === "recipe") return { kind: "recipe", recipe: view.recipe, lastServings: view.lastServings };
  return null;
}

/** The grams a log form holds, as a last amount, so a copy saved from a food's view opens with them. Undefined for portions or nothing that parses. */
export function typedLastOf(form: Pick<LogForm, "unit" | "amount">): LastAmount | undefined {
  const typed = form.unit === GRAMS ? parseAmount(form.amount, GRAMS) : null;
  return typeof typed === "number" ? { grams: typed, portion: null } : undefined;
}
