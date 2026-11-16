// ---------------------------------------------------------------------------
// How an entry's amount reads: a portion or meal count with up to two
// decimals, no grouping, in Latin digits, so what shows can be typed back
// (lib/targetFormat.ts says why). Grams and figures read through
// lib/foodFormat.ts.
// ---------------------------------------------------------------------------

/** A portion or meal count, at most two decimals: 1, 2.5, 0.25. */
export function formatCount(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    useGrouping: false,
    numberingSystem: "latn",
  }).format(value);
}
