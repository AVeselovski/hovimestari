import { addDays } from "./localDate";

// ---------------------------------------------------------------------------
// The week the week sheet shows: Monday to Sunday, holding a date. Finland's
// week, and the week a plan is made for. It stays put while the day inside
// it changes. Dates are `YYYY-MM-DD`, with arithmetic in UTC as everywhere in
// lib/localDate.ts, so no daylight-saving switch can move a week.
// ---------------------------------------------------------------------------

/** The first day of a week, as `Date.prototype.getUTCDay` numbers it: Monday. */
export const WEEK_START = 1;

/** How many days a week holds. */
export const WEEK_LENGTH = 7;

/** The week holding `date`: its first and its last day, both included. */
export function weekOf(date: string): { from: string; to: string } {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(weekday)) throw new RangeError(`Not a date: ${date}`);
  const from = addDays(date, -((weekday - WEEK_START + WEEK_LENGTH) % WEEK_LENGTH));
  return { from, to: addDays(from, WEEK_LENGTH - 1) };
}

/** The first day of the week `n` weeks from the week starting `from`. `n` may be negative. */
export function stepWeek(from: string, n: number): string {
  return addDays(from, n * WEEK_LENGTH);
}

/** The seven dates of the week starting `from`, in order. */
export function weekDates(from: string): string[] {
  return Array.from({ length: WEEK_LENGTH }, (_, i) => addDays(from, i));
}
