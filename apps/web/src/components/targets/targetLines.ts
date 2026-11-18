import { dayBefore } from "@/lib/localDate";
import type { TargetChange } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Which days a save or a removal changes, and which change is in force on a
// date, from the list of changes the server answered.
//
// A change covers the days from its date to the day before the next change.
// The first change also covers every day before it.
// ---------------------------------------------------------------------------

/** Which days a save on a date applies to, before it is put in words. */
export type Span =
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
 * The change in force on `date`: the latest one on or before it, else the
 * first. Null only with no changes. The server's rule, read from the list
 * the server answered, so a sheet can fill its fields as it opens.
 */
export function inForceOn(changes: readonly TargetChange[], date: string): TargetChange | null {
  const all = sorted(changes);
  return all.filter((c) => c.effectiveFrom <= date).at(-1) ?? all[0] ?? null;
}

/**
 * The days a save on `date` applies to: from the date to the day before the
 * next change, or on from the date when none follows. A save before every
 * other change becomes the first one, and covers the days before it too.
 * Every other day keeps the targets it has.
 */
export function spanOf(changes: readonly TargetChange[], date: string): Span {
  const earlier = changes.some((c) => c.effectiveFrom < date);
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
