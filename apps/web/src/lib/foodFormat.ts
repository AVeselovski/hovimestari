// ---------------------------------------------------------------------------
// How a food's figures read: energy in whole kcal, a macro's grams with one
// decimal always, so a column of them lines up, and a weight to at most one
// decimal, as it was typed. The
// server answers the figures and the screen only rounds them for display, it
// computes none. In this device's language, never with digit grouping and
// always in Latin digits, for the reasons lib/targetFormat.ts gives: what the
// app shows can always be typed back into a number field.
// ---------------------------------------------------------------------------

function format(value: number, decimals: number, locale?: string, minimumDecimals = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minimumDecimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
    numberingSystem: "latn",
  }).format(value);
}

/** Energy in kcal, as a whole number. */
export function formatKcal(value: number, locale?: string): string {
  return format(value, 0, locale);
}

/**
 * A saved value as it would be typed back into its field: every decimal the
 * catalogue holds (at most three), no grouping.
 */
export function formatDecimalForField(value: number, locale?: string): string {
  return format(value, 3, locale);
}

/** A weight in grams, to at most one decimal. */
export function formatGrams(value: number, locale?: string): string {
  return format(value, 1, locale);
}

/**
 * A macro's grams per 100 g, with exactly one decimal ("4.0", "7.2"), so the
 * decimals of a right-aligned column line up. Typed back, "4.0" reads as 4.
 */
export function formatMacroGrams(value: number, locale?: string): string {
  return format(value, 1, locale, 1);
}
