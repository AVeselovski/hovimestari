import { dayBefore } from "@/lib/localDate";
import type { TargetChange } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Which days a save or a removal changes, from the list of changes the
// server answered.
//
// A change covers the days from its date to the day before the next change.
// A day before the first change has no targets.
// ---------------------------------------------------------------------------

/**
 * The days a change on a date covers, before it is put in words, and whether
 * a change starts before that date (`earlier`), so the days before it keep
 * their targets rather than having none.
 */
export type Span = (
  { kind: "between"; date: string; end: string } | { kind: "day"; date: string } | { kind: "from"; date: string }
) & { earlier: boolean };

function sorted(changes: readonly TargetChange[]): TargetChange[] {
  return [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** The first change after `date`, if any. */
export function nextChangeAfter(changes: readonly TargetChange[], date: string): TargetChange | undefined {
  return sorted(changes).find((c) => c.effectiveFrom > date);
}

/**
 * The days a change on `date` covers: from the date to the day before the
 * next change, or on from the date when none follows. The change on `date`
 * itself is left out of both comparisons, so the same span names the days a
 * save on `date` applies to and the days a removal of the change on `date`
 * gives back to an earlier change or leaves without targets. Every other day
 * keeps what it has.
 */
export function spanOf(changes: readonly TargetChange[], date: string): Span {
  const earlier = changes.some((c) => c.effectiveFrom < date);
  const next = nextChangeAfter(changes, date);
  if (!next) return { kind: "from", date, earlier };
  const end = dayBefore(next.effectiveFrom);
  return date === end ? { kind: "day", date, earlier } : { kind: "between", date, end, earlier };
}
