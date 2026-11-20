import {
  copyEntriesTool,
  logEstimateTool,
  logFoodTool,
  logRecipeTool,
  logSavedMealTool,
  removeEntriesTool,
  restoreEntryTool,
  setEntriesStatusTool,
  updateEntryTool,
} from "./entries.js";
import { addPortionTool, createOwnFoodTool, setFavouriteTool, updateOwnFoodTool, updatePortionTool } from "./foods.js";
import { createSavedMealTool, setSavedMealArchivedTool, updateSavedMealTool } from "./meals.js";
import { createRecipeTool, setRecipeArchivedTool, setRecipeFavouriteTool, updateRecipeTool } from "./recipes.js";
import type { WriteTool } from "./run.js";
import { removeTargetsTool, setTargetsTool } from "./targets.js";

// The write tools, listed only to a key that can write while writing is
// switched on (server.ts). One file per area under tools/writes/, each tool
// defined with defineWriteTool and added here, never to READ_TOOLS.

/* eslint-disable @typescript-eslint/no-explicit-any -- each tool keeps its own args type; the set is heterogeneous. */
type AnyWriteTool = WriteTool<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const WRITE_TOOLS: readonly AnyWriteTool[] = [
  logFoodTool,
  logSavedMealTool,
  logEstimateTool,
  logRecipeTool,
  updateEntryTool,
  setEntriesStatusTool,
  copyEntriesTool,
  removeEntriesTool,
  restoreEntryTool,
  createOwnFoodTool,
  updateOwnFoodTool,
  addPortionTool,
  updatePortionTool,
  setFavouriteTool,
  createSavedMealTool,
  updateSavedMealTool,
  setSavedMealArchivedTool,
  createRecipeTool,
  updateRecipeTool,
  setRecipeArchivedTool,
  setRecipeFavouriteTool,
  setTargetsTool,
  removeTargetsTool,
];
