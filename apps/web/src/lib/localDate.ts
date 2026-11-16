// ---------------------------------------------------------------------------
// Calendar dates as the API sends them, `YYYY-MM-DD` strings with no time and
// no zone. Arithmetic runs in UTC on purpose: a date here is a day, not an
// instant, so no daylight-saving switch can move it. Which date is "today"
// comes from the server (`today` in the targets answer), which reads it in the
// user's stored time zone. Never from this device's clock.
// ---------------------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The instant at UTC midnight of `date`, or null for a string that is not a real date. */
function utcMidnight(date: string): Date | null {
  const match = ISO.exec(date);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d ? at : null;
}

/** Whether `date` is a `YYYY-MM-DD` that exists. */
export function isIsoDate(date: string): boolean {
  return utcMidnight(date) !== null;
}

/** `date` moved by `days`, which may be negative. */
export function addDays(date: string, days: number): string {
  const at = utcMidnight(date);
  if (!at) throw new RangeError(`Not a date: ${date}`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The day before `date`. */
export function dayBefore(date: string): string {
  return addDays(date, -1);
}

/**
 * `date` for a reader, in this device's language: "16 November 2026" on a
 * British or Finnish phone, "November 16, 2026" on an American one. Rendering,
 * not copy, so it follows the device and not the catalog's English.
 */
export function formatDay(date: string, locale?: string): string {
  const at = utcMidnight(date);
  if (!at) return date;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    at,
  );
}
