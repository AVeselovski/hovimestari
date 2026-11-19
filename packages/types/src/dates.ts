import { z } from "zod";

/**
 * A calendar date, `YYYY-MM-DD`, that exists. Year 0 is refused too, because
 * Postgres has no year 0 and would fail the query instead of answering 400.
 */
export const IsoDateSchema = z.iso
  .date({ error: "invalid_date" })
  .refine((s) => !s.startsWith("0000"), { error: "invalid_date" });

/** The zone every account starts with, and the one a stored zone the runtime no longer knows falls back to. */
export const DEFAULT_TIME_ZONE = "Europe/Helsinki";

/**
 * The canonical name of IANA time zone `name` as the runtime's `Intl` knows
 * it ("europe/helsinki" gives "Europe/Helsinki"), or null. An offset such as
 * "+02:00", which `Intl` also accepts, is not a zone and gives null.
 */
export function canonicalTimeZone(name: string): string | null {
  try {
    const zone = new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
    return /^[A-Za-z]/.test(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Whether `name` is an IANA time zone the runtime's `Intl` knows. */
export const isKnownTimeZone = (name: string): boolean => canonicalTimeZone(name) !== null;

/** An IANA time zone name the runtime knows, answered in its canonical spelling. */
export const TimeZoneSchema = z
  .string({ error: "invalid_time_zone" })
  .max(64, { error: "invalid_time_zone" })
  .transform((name, ctx) => {
    const zone = canonicalTimeZone(name);
    if (zone === null) ctx.addIssue({ code: "custom", message: "invalid_time_zone" });
    return zone ?? name;
  });

export type IsoDate = z.infer<typeof IsoDateSchema>;

// ---------------------------------------------------------------------------
// Calendar arithmetic on `YYYY-MM-DD` dates, in UTC on purpose: a date here is
// a day, not an instant, so no daylight-saving switch can move it. The week is
// Monday to Sunday, the week a plan is made for. The web's week sheet and the
// assistant's get_days read the same week from these.
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The instant at UTC midnight of `date`, or null for a string that is not a real date. */
function utcMidnightOf(date: string): Date | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d ? at : null;
}

/** `date` moved by `days`, which may be negative. Throws a RangeError for a string that is not a real date. */
export function addDays(date: string, days: number): string {
  const at = utcMidnightOf(date);
  if (!at) throw new RangeError(`Not a date: ${date}`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The first day of a week, as `Date.prototype.getUTCDay` numbers it: Monday. */
export const WEEK_START = 1;

/** How many days a week holds. */
export const WEEK_LENGTH = 7;

/** The week holding `date`: its Monday and its Sunday, both included. */
export function weekOf(date: string): { from: string; to: string } {
  const at = utcMidnightOf(date);
  if (!at) throw new RangeError(`Not a date: ${date}`);
  const from = addDays(date, -((at.getUTCDay() - WEEK_START + WEEK_LENGTH) % WEEK_LENGTH));
  return { from, to: addDays(from, WEEK_LENGTH - 1) };
}
