// ---------------------------------------------------------------------------
// Every query key, from one factory, so a read and its invalidation can
// never spell a key two ways. One key family per area. Later steps add
// theirs here.
// ---------------------------------------------------------------------------

export const queryKeys = {
  /** The signed-in user. */
  me: () => ["me"] as const,
};
