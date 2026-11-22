import type { FoodSummary, LastAmount, RecipeSummary, SavedMeal } from "@hovimestari/types";
import type { LogAgain } from "./useLogAgain";

/** What the log sheet's browse lists need to log an item again, and to open it. */
export interface BrowseLogging {
  again: LogAgain;
  /** Writes wait: the app asks the server for today. */
  held: boolean;
  /** The sheet's date is after today: "+" plans rather than logs. */
  planned: boolean;
  /** Opens a food's view. `last` is its last amount, null when it was never logged. */
  onOpenFood: (food: FoodSummary, opener: HTMLElement, last: LastAmount | null) => void;
  /** Opens a saved meal's view, with its last count. */
  onOpenMeal: (meal: SavedMeal, opener: HTMLElement, lastCount: number | null) => void;
  /** Opens a recipe's view, with its last servings. */
  onOpenRecipe: (recipe: RecipeSummary, opener: HTMLElement, lastServings: number | null) => void;
}
