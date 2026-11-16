// ---------------------------------------------------------------------------
// Every query key, from one factory, so a read and its invalidation can
// never spell a key two ways. One key family per area. Later steps add
// theirs here.
// ---------------------------------------------------------------------------

export const queryKeys = {
  /** The signed-in user. */
  me: () => ["me"] as const,
  /** Which sign-in providers this deployment offers. */
  providers: () => ["providers"] as const,
  /**
   * The targets in force today, every change and the user's today. No date
   * in the key: the first-run gate reads it, and a key that changed at
   * midnight would put the gate back into a pending state.
   */
  targets: () => ["targets"] as const,
  /** The targets in force on one date. Under `targets()`, so one invalidation covers both. */
  targetsOn: (date: string) => ["targets", date] as const,
  /** Every food read. A food-name language change and every food write refresh them all. */
  foods: () => ["foods"] as const,
  /** The search results for one query, keyed by `foodSearchKey(q)`. */
  foodSearch: (q: string) => ["foods", "search", foodSearchKey(q)] as const,
  /** Every cached search, for a write that changes what a row shows. */
  foodSearches: () => ["foods", "search"] as const,
  /** One food with its portions. */
  foodDetail: (id: string) => ["foods", "detail", id] as const,
  /** The user's favourites. */
  foodFavourites: () => ["foods", "favourites"] as const,
  /** The user's own foods. */
  foodOwn: () => ["foods", "own"] as const,
};

/**
 * A search query as the cache keys it and the request sends it: trimmed and
 * lower-cased. The server lower-cases and folds accents before it matches,
 * so "Rahka" and "rahka" answer the same and share one cache entry. The
 * client folds no further, so two queries the server reads alike may still
 * have two entries.
 */
export function foodSearchKey(q: string): string {
  return q.trim().toLowerCase();
}
