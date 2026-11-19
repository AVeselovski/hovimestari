import { addDays, WEEK_LENGTH } from "@hovimestari/types";

export { WEEK_LENGTH, WEEK_START, weekOf } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The week the week sheet shows: Monday to Sunday, holding a date. Finland's
// week, and the week a plan is made for. It stays put while the day inside
// it changes. `weekOf`, `WEEK_START` and `WEEK_LENGTH` live in the shared
// package, where the assistant's get_days reads the same week, and are
// re-exported here so the web keeps one import path.
// ---------------------------------------------------------------------------

/** The first day of the week `n` weeks from the week starting `from`. `n` may be negative. */
export function stepWeek(from: string, n: number): string {
  return addDays(from, n * WEEK_LENGTH);
}

/** The seven dates of the week starting `from`, in order. */
export function weekDates(from: string): string[] {
  return Array.from({ length: WEEK_LENGTH }, (_, i) => addDays(from, i));
}
