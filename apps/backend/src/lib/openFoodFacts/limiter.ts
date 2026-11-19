// The budgets for calls to Open Food Facts. A bucket holds up to `capacity`
// calls and gives one back every `refillEveryMs`. Time comes from `now`, so a
// test owns its clock. Credit is kept in whole milliseconds, so no floating
// point error can make a full bucket read as one short.

export interface BucketOptions {
  capacity: number;
  refillEveryMs: number;
  now: () => number;
}

interface State {
  /** Credit in milliseconds: one call is `refillEveryMs` of it. */
  credit: number;
  at: number;
}

function levelOf(state: State, { capacity, refillEveryMs }: BucketOptions, now: number): number {
  return Math.min(capacity * refillEveryMs, state.credit + Math.max(0, now - state.at));
}

export interface TokenBucket {
  /** Whether a call can be taken now. */
  has(): boolean;
  /** Takes one call. Call only after `has()` answered true. */
  take(): void;
}

/** One bucket, full at the start. */
export function tokenBucket(options: BucketOptions): TokenBucket {
  const state: State = { credit: options.capacity * options.refillEveryMs, at: options.now() };
  return {
    has: () => levelOf(state, options, options.now()) >= options.refillEveryMs,
    take() {
      const now = options.now();
      state.credit = levelOf(state, options, now) - options.refillEveryMs;
      state.at = now;
    },
  };
}

/** How often the per-key map is swept of buckets that have refilled. */
export const SWEEP_EVERY_MS = 60_000;

export interface KeyedBuckets {
  has(key: string): boolean;
  take(key: string): void;
  /** How many keys hold a bucket below capacity. */
  size(): number;
}

/**
 * A bucket per key, full until the key first takes. A bucket that has
 * refilled to full is the same as none, so a sweep on `take`, at most once a
 * minute, drops it. The map never holds more keys than have taken within the
 * time a bucket takes to refill.
 */
export function keyedBuckets(options: BucketOptions): KeyedBuckets {
  const full = options.capacity * options.refillEveryMs;
  const buckets = new Map<string, State>();
  let sweptAt = options.now();

  const sweep = (now: number) => {
    if (now - sweptAt < SWEEP_EVERY_MS) return;
    sweptAt = now;
    for (const [key, state] of buckets) if (levelOf(state, options, now) >= full) buckets.delete(key);
  };

  return {
    has(key) {
      const state = buckets.get(key);
      return state === undefined || levelOf(state, options, options.now()) >= options.refillEveryMs;
    },
    take(key) {
      const now = options.now();
      sweep(now);
      const state = buckets.get(key) ?? { credit: full, at: now };
      buckets.set(key, { credit: levelOf(state, options, now) - options.refillEveryMs, at: now });
    },
    size: () => buckets.size,
  };
}
