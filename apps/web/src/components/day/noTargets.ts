import { sameTargets, type Day, type TargetsOverview } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Whether the Day tab's summary shows a day without targets, and what its
// row says. A user with no change at all has no targets on any day. A day
// without targets, for a user with changes, is exactly a day before the
// first change. So the changes the gate already holds tell the frame which
// layout follows before the day answers.
// ---------------------------------------------------------------------------

/**
 * A day without targets: `none` for a user with no change at all, whose row
 * offers Set targets. `from` names the date the user's first change starts.
 * `pending` is a loaded day without targets while the cached changes say it
 * has some, until the targets are read again.
 */
export type NoTargets = { kind: "none" } | { kind: "from"; date: string } | { kind: "pending" };

/** The earliest start among the changes, whatever their order. */
function firstStart(overview: TargetsOverview | undefined): string | null {
  const starts = overview?.changes.map((c) => c.effectiveFrom) ?? [];
  return starts.length === 0 ? null : starts.reduce((a, b) => (b < a ? b : a));
}

/**
 * The frame's layout before the day answers. No cached answer: the gauges'
 * frame, as before. No change at all: `none`. A date before the first
 * change: a day without targets, from that change's date.
 */
export function predictedNoTargets(date: string | null, overview: TargetsOverview | undefined): NoTargets | null {
  if (overview === undefined) return null;
  const first = firstStart(overview);
  if (first === null) return { kind: "none" };
  return date !== null && date < first ? { kind: "from", date: first } : null;
}

/**
 * The loaded day's layout. A day with targets has no row. A day without
 * them takes Set targets or the start line when the cached changes agree,
 * and is `pending` when they do not: the row then keeps its room, empty, and
 * never says a date it cannot stand behind.
 */
export function loadedNoTargets(day: Day, overview: TargetsOverview | undefined): NoTargets | null {
  if (day.targets !== null) return null;
  return predictedNoTargets(day.date, overview) ?? { kind: "pending" };
}

/**
 * The line under the week table about targets. `first`: the week holds a day
 * before the first change, which starts on `date`. `new`: a later change
 * starts after the week's Monday and on or before its Sunday, so the rows'
 * bands shift on `date`. A change equal bound for bound to the one before it
 * moves no band, so it is skipped. With several, the first in the week.
 * `first` wins when both could show. Null when the week holds neither.
 */
export type WeekTargetsLine = { kind: "first" | "new"; date: string };

export function weekTargetsLine(
  from: string,
  to: string,
  overview: TargetsOverview | undefined,
): WeekTargetsLine | null {
  const before = predictedNoTargets(from, overview);
  if (before?.kind === "from") return { kind: "first", date: before.date };
  const changes = [...(overview?.changes ?? [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const moved = changes.find(
    (c, i) =>
      c.effectiveFrom > from && c.effectiveFrom <= to && !(i > 0 && sameTargets(c.ranges, changes[i - 1]!.ranges)),
  );
  return moved ? { kind: "new", date: moved.effectiveFrom } : null;
}
