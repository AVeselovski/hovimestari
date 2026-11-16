import { dayBefore } from "@/lib/localDate";
import type { TargetChange } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Which days a save or a removal changes, from the list of changes the
// server answered. The in-force rule itself stays on the server: these only
// name the stretch of days between one change and the next.
//
// A change covers the days from its date to the day before the next change.
// The first change also covers every day before it.
// ---------------------------------------------------------------------------

/** What the rewrite line says, before it is put in words. */
export type Rewrite =
  | { kind: "between"; date: string; end: string }
  | { kind: "day"; date: string }
  | { kind: "from"; date: string }
  | { kind: "before"; next: string }
  | { kind: "all" };

function sorted(changes: readonly TargetChange[]): TargetChange[] {
  return [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** The first change after `date`, if any. */
export function nextChangeAfter(changes: readonly TargetChange[], date: string): TargetChange | undefined {
  return sorted(changes).find((c) => c.effectiveFrom > date);
}

/**
 * The days a save on `date` changes, or null when it changes none that have
 * passed. Shown when the save rewrites days that already have targets: a
 * date of today or earlier, an edit of an existing change, or a date before
 * every change, which then covers the days before it too. A new change on a
 * later date leaves every day before it as it was, and says nothing.
 */
export function rewriteOf(changes: readonly TargetChange[], date: string, today: string): Rewrite | null {
  const existing = changes.some((c) => c.effectiveFrom === date);
  const earlier = changes.some((c) => c.effectiveFrom < date);
  if (!existing && earlier && date > today) return null;
  const next = nextChangeAfter(changes, date);
  if (!earlier) return next ? { kind: "before", next: next.effectiveFrom } : { kind: "all" };
  return next ? stretch(date, dayBefore(next.effectiveFrom)) : { kind: "from", date };
}

/** What removing the change on `date` does to the days it covered. */
export type Removal =
  | { kind: "between"; date: string; end: string }
  | { kind: "day"; date: string }
  | { kind: "from"; date: string }
  | { kind: "first"; next: string };

/** The stretch from `date` to `end`, or the one day when the two are the same. */
function stretch(
  date: string,
  end: string,
): { kind: "between"; date: string; end: string } | { kind: "day"; date: string } {
  return date === end ? { kind: "day", date } : { kind: "between", date, end };
}

/** Null only when nothing could take its place: the last change, which cannot be removed. */
export function removalOf(changes: readonly TargetChange[], date: string): Removal | null {
  const earlier = changes.some((c) => c.effectiveFrom < date);
  const next = nextChangeAfter(changes, date);
  if (!earlier) return next ? { kind: "first", next: next.effectiveFrom } : null;
  return next ? stretch(date, dayBefore(next.effectiveFrom)) : { kind: "from", date };
}
