// The answers the lookup did not store (not found, incomplete), held a while
// so a second lookup of an unknown product spends no call. Keyed on the
// 14-digit form. Time comes from `now`, so a test owns its clock.

export interface AnswerCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  size(): number;
}

/** At most `max` answers, each for `ttlMs`, the oldest first out. */
export function answerCache<T>({ ttlMs, max, now }: { ttlMs: number; max: number; now: () => number }): AnswerCache<T> {
  const entries = new Map<string, { value: T; until: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.until) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, until: now() + ttlMs });
      while (entries.size > max) entries.delete(entries.keys().next().value as string);
    },
    size: () => entries.size,
  };
}
