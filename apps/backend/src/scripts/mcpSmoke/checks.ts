import { isDeepStrictEqual } from "node:util";

// What both legs of the smoke check share: the tool names a key should
// list, written out here rather than read from the registries, so a tool
// that goes missing or appears unasked shows, and the tally of comparisons.

/* eslint-disable @typescript-eslint/no-explicit-any -- the script reads untyped JSON from both sides. */
export type Json = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const READ_TOOL_NAMES = [
  "get_context",
  "get_targets",
  "get_day",
  "get_days",
  "search_foods",
  "get_food",
  "list_favourite_foods",
  "list_own_foods",
  "list_recent_items",
  "list_saved_meals",
  "get_saved_meal",
  "list_recipes",
  "get_recipe",
  "preview_recipe",
  "look_up_barcode",
];

export const WRITE_TOOL_NAMES = [
  "log_food",
  "log_saved_meal",
  "log_estimate",
  "log_recipe",
  "update_entry",
  "set_entries_status",
  "copy_entries",
  "remove_entries",
  "restore_entry",
  "create_own_food",
  "update_own_food",
  "add_portion",
  "update_portion",
  "set_favourite",
  "create_saved_meal",
  "update_saved_meal",
  "set_saved_meal_archived",
  "create_recipe",
  "update_recipe",
  "set_recipe_archived",
  "set_recipe_favourite",
  "set_targets",
  "remove_targets",
];

/** Every comparison made and every one that failed, across both legs. */
export const tally = { checks: 0, failures: [] as string[] };

export function same(label: string, actual: unknown, expected: unknown): void {
  tally.checks++;
  if (!isDeepStrictEqual(actual, expected)) {
    tally.failures.push(
      `${label}: got ${JSON.stringify(actual)?.slice(0, 300)}, expected ${JSON.stringify(expected)?.slice(0, 300)}`,
    );
  }
}

/** A targets overview as an assistant reads it: the route's answer without its screen-routing `firstRunDue`. */
export function withoutRouting({ firstRunDue: _routing, ...rest }: Json): Json {
  return rest;
}
