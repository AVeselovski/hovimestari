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
  /** Every food read. A food-name language change refreshes them all. */
  foods: () => ["foods"] as const,
};
