import { DEFAULT_TIME_ZONE, isKnownTimeZone } from "@hovimestari/types";

/** The zone every account starts with, and the one a stored zone the runtime no longer knows falls back to. */
export const FALLBACK_TIME_ZONE = DEFAULT_TIME_ZONE;

/**
 * The calendar date, `YYYY-MM-DD`, that `now` falls on in `timeZone`. A day
 * starts at the zone's local midnight, so a daylight-saving switch moves the
 * hour a date starts at, never which date an instant belongs to. Built from
 * the formatter's parts, never from a locale's date pattern, which ICU
 * versions have changed.
 */
export function calendarDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** `stored` when the runtime knows it, otherwise the fallback zone, with a log line. */
export function usableTimeZone(stored: string): string {
  if (isKnownTimeZone(stored)) return stored;
  console.warn(`[userTime] unknown stored time zone "${stored}", using ${FALLBACK_TIME_ZONE}`);
  return FALLBACK_TIME_ZONE;
}
