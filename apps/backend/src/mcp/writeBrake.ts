// ---------------------------------------------------------------------------
// The brakes on an assistant's writes (design d.4), lifted from
// finanssiappisV2's mcp/writeBrake.ts with one change: they count per user,
// so every key of one person shares them, and ten keys get no more than one.
// Both answer the model with an error result, never an HTTP 429: a 429 is a
// transport error that a bridge such as mcp-remote retries, while an error
// result reaches the model, which stops.
//
// - Per minute, in memory and per machine: a sliding window over the user's
//   write calls. A call the app goes on to refuse counts. A call this brake
//   refuses does not, so a model that keeps calling is let in again a minute
//   after its last admitted call. A second machine keeps its own window.
// - Per hour, from the database, so it holds across machines and restarts:
//   the changes recorded for the user (tools/writes/run.ts counts them
//   through countRecentChanges). It is read before the write's transaction,
//   so calls in flight together can each pass it at 299 and land past 300.
//   The per-minute brake bounds that overshoot to one minute's calls.
// ---------------------------------------------------------------------------

/** Write calls one person's keys may make in a minute, together, on one machine. */
export const WRITES_PER_MINUTE = 30;
/** Changes one person's keys may have recorded in the last hour, together, across machines. */
export const CHANGES_PER_HOUR = 300;
export const HOUR_MS = 3_600_000;

export interface SlidingWindow {
  /** Counts a call by `key` at `now` and says whether it is within the limit. A call it refuses is not counted. */
  admit(key: string, now: number): boolean;
  /** Forgets every key. For tests. */
  reset(): void;
  /** How many keys have calls in the window. For tests. */
  size(): number;
}

export function createSlidingWindow(limit: number, windowMs: number): SlidingWindow {
  const calls = new Map<string, number[]>();
  let sweptAt = -Infinity;
  return {
    admit(key, now) {
      // Drop the books of keys with no call left in the window, so an idle key
      // holds no memory. Once a window at most, so a call costs one book, not
      // every person's: an idle book lives at most two windows.
      if (now - sweptAt >= windowMs) {
        sweptAt = now;
        for (const [k, at] of calls) if (at[at.length - 1] <= now - windowMs) calls.delete(k);
      }
      const recent = (calls.get(key) ?? []).filter((at) => at > now - windowMs);
      if (recent.length >= limit) {
        calls.set(key, recent);
        return false;
      }
      recent.push(now);
      calls.set(key, recent);
      return true;
    },
    reset() {
      calls.clear();
      sweptAt = -Infinity;
    },
    size() {
      return calls.size;
    },
  };
}

/** One per process: the per-minute books of every user this machine serves, keyed by user id. */
export const writesPerMinute = createSlidingWindow(WRITES_PER_MINUTE, 60_000);
