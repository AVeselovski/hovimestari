import { DEFAULT_TIME_ZONE, canonicalTimeZone } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Calendar dates as the API sends them, `YYYY-MM-DD` strings with no time and
// no zone. Arithmetic runs in UTC on purpose: a date here is a day, not an
// instant, so no daylight-saving switch can move it. Which date is "today"
// comes from the server (`today` in every targets and day answer), which reads
// it in the user's stored time zone. The device's clock only decides when to
// ask the server again (`todayIn`, components/targets/TodayProvider.tsx).
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

/**
 * The `YYYY-MM-DD` that the instant `now` falls on in `timeZone`. A zone the
 * runtime does not know reads as Helsinki, as the server reads it. Used only
 * to decide when to ask the server for today again, never as today itself.
 */
export function todayIn(timeZone: string, now: number): string {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      ...options,
      timeZone: canonicalTimeZone(timeZone) ?? DEFAULT_TIME_ZONE,
    });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: DEFAULT_TIME_ZONE });
  }
  const parts = format.formatToParts(new Date(now));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
export function daysFrom(from: string, to: string): number {
  const a = utcMidnight(from);
  const b = utcMidnight(to);
  if (!a || !b) throw new RangeError(`Not a date: ${a ? to : from}`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** What `date` is to `today` in a word, or null when it is further away: the catalog names the word. */
export function dayLabel(date: string, today: string): "today" | "yesterday" | "tomorrow" | null {
  switch (daysFrom(today, date)) {
    case 0:
      return "today";
    case -1:
      return "yesterday";
    case 1:
      return "tomorrow";
    default:
      return null;
  }
}

/**
 * A week row's date, in this device's language: the weekday short ("Mon"),
 * the day of the month ("16"), and the whole date for a screen reader
 * ("Monday 16 November" on a British phone, "Monday, November 16" on an
 * American one). Rendering, not copy.
 */
export function formatWeekRowDate(date: string, locale?: string): { weekday: string; day: string; spoken: string } {
  const at = utcMidnight(date);
  if (!at) return { weekday: "", day: date, spoken: date };
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(at);
  return {
    weekday: part({ weekday: "short" }),
    day: part({ day: "numeric" }),
    spoken: part({ weekday: "long", day: "numeric", month: "long" }),
  };
}

/** A dash or a tilde between the two ends of a range, with the spaces around it. */
const RANGE_DASH = /\s*[‐-―−~～〜-]\s*/u;

/**
 * A week for a title, in this device's language and order: "16 to 22 Nov" on
 * a British phone, "Nov 16 to 22" on an American one, "30 Nov to 6 Dec"
 * across two months. A week outside `today`'s year shows its year as the
 * locale puts it: once when both ends share it ("4 to 10 Jan 2027"), on both
 * ends when they do not ("28 Dec 2026 to 3 Jan 2027"). The dash or tilde the
 * locale puts between the two ends becomes `separator`, the catalog's " to ",
 * so no dash shows on screen and the locale's own order and marks stay
 * ("11월 16일 to 22일" in Korean). A locale that puts a word there keeps its
 * word. Rendering, not copy.
 */
export function formatWeekRange(from: string, to: string, today: string, separator: string, locale?: string): string {
  const start = utcMidnight(from);
  const end = utcMidnight(to);
  if (!start || !end) return `${from}${separator}${to}`;
  const withYear = from.slice(0, 4) !== today.slice(0, 4) || to.slice(0, 4) !== today.slice(0, 4);
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
  if (typeof format.formatRangeToParts !== "function")
    return `${format.format(start)}${separator}${format.format(end)}`;
  const parts = format.formatRangeToParts(start, end);
  const lastStart = parts.findLastIndex((p) => p.source === "startRange");
  const firstEnd = parts.findIndex((p) => p.source === "endRange");
  if (lastStart < 0 || firstEnd < 0 || firstEnd < lastStart) {
    return `${format.format(start)}${separator}${format.format(end)}`;
  }
  // The shared text between the two ends holds the mark: "–", " – ", ".–" or "일~".
  // Only the mark is replaced. Text around it stays, and a word with no mark stays whole.
  const between = parts
    .slice(lastStart + 1, firstEnd)
    .map((p) => p.value)
    .join("");
  const joined = between.replace(RANGE_DASH, separator);
  const text = (slice: typeof parts) => slice.map((p) => p.value).join("");
  return `${text(parts.slice(0, lastStart + 1))}${joined}${text(parts.slice(firstEnd))}`;
}

/**
 * `date` short, for a line that has one line of room: "Tue 17 Nov" on a
 * British phone, "ti 17. marrask." on a Finnish one. The year follows only
 * when it is not `today`'s ("Mon 17 Nov 2025"), so a far date never reads
 * as this year's.
 * Rendering, not copy: it follows the device's language.
 */
export function formatDayShort(date: string, locale?: string, today?: string): string {
  const at = utcMidnight(date);
  if (!at) return date;
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
  if (today === undefined || today.slice(0, 4) === date.slice(0, 4)) return day;
  // The year after the same short form, with no comma between them: "Mon 17 Nov 2025".
  return `${day} ${new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(at)}`;
}
