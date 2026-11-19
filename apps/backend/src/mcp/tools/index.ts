import type { Tool } from "../result.js";
import { getContext } from "./context.js";
import { getDaysTool, getDayTool, getTargetsTool } from "./days.js";
import {
  getFoodTool,
  listFavouriteFoodsTool,
  listOwnFoodsTool,
  listRecentItemsTool,
  lookUpBarcodeTool,
  searchFoodsTool,
} from "./foods.js";
import { getSavedMealTool, listSavedMealsTool } from "./meals.js";

// The read tools every key lists. One file per area under tools/, each tool
// defined with defineTool and added here.

/* eslint-disable @typescript-eslint/no-explicit-any -- each tool keeps its own args type; the set is heterogeneous. */
type AnyTool = Tool<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const READ_TOOLS: readonly AnyTool[] = [
  getContext,
  getTargetsTool,
  getDayTool,
  getDaysTool,
  searchFoodsTool,
  getFoodTool,
  listFavouriteFoodsTool,
  listOwnFoodsTool,
  listRecentItemsTool,
  listSavedMealsTool,
  getSavedMealTool,
  lookUpBarcodeTool,
];
