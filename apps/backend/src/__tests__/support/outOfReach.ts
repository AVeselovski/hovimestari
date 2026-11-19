/**
 * The write services no assistant tool may reach, by name: the deletions the
 * screen offers (an own food, a saved meal, a portion), approving a deletion
 * request, and `removeEntry`, the screen's one-entry removal. Removing
 * entries is in reach only as `remove_entries`, which calls `removeEntries`,
 * and removing a targets change only as `remove_targets`, which calls
 * `removeTargetChange`. Neither of those is listed. Nothing under src/mcp/ or
 * services/writes/recorded/ names a listed service, so no tool can wrap one.
 */
export const OUT_OF_REACH = ["deleteOwnFood", "deleteSavedMeal", "removePortion", "removeEntry", "approveDeletion"];

/** The out-of-reach names `source` mentions, matched as whole words. */
export const outOfReachIn = (source: string): string[] =>
  OUT_OF_REACH.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(source));
