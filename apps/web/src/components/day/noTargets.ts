import type { Day, TargetsOverview } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Whether the Day tab's summary shows a day without targets, and what its
// row says. A day without targets, for a user with changes, is exactly a day
// before the first change, so the changes the gate already holds tell the
// frame which layout follows before the day answers.
// ---------------------------------------------------------------------------

/**
 * A day without targets: `from` names the date the user's first change
 * starts, `pending` is a loaded day without targets while the cached changes
 * say it has some, until the targets are read again.
 */
export type NoTargets = { kind: "from"; date: string } | { kind: "pending" };

/** The earliest start among the changes, whatever their order. */
function firstStart(overview: TargetsOverview | undefined): string | null {
  const starts = overview?.changes.map((c) => c.effectiveFrom) ?? [];
  return starts.length === 0 ? null : starts.reduce((a, b) => (b < a ? b : a));
}

/**
 * The frame's layout before the day answers. No cached answer, or no
 * change: the gauges' frame, as before. A date before the first change: a
 * day without targets, from that change's date.
 */
export function predictedNoTargets(date: string | null, overview: TargetsOverview | undefined): NoTargets | null {
  const first = firstStart(overview);
  return date !== null && first !== null && date < first ? { kind: "from", date: first } : null;
}

/**
 * The loaded day's layout. A day with targets has no row. A day without
 * them takes the start line when the cached changes agree, and is `pending`
 * when they do not: the row then keeps its room, empty, and never says a
 * date it cannot stand behind.
 */
export function loadedNoTargets(day: Day, overview: TargetsOverview | undefined): NoTargets | null {
  if (day.targets !== null) return null;
  return predictedNoTargets(day.date, overview) ?? { kind: "pending" };
}
