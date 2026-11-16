// ---------------------------------------------------------------------------
// How a target's figures read. In this device's language, so a Finnish phone
// shows "142,5" and an English one "142.5", and never with digit grouping:
// "1,800" on an English phone would be typed back as 1.8, because the number
// fields read a comma as the decimal separator (lib/decimalInput.ts). Always
// in Latin digits: a language with digits of its own, such as Arabic, would
// show figures the fields cannot read back.
// ---------------------------------------------------------------------------

/** A target bound for a reader: at most one decimal, no grouping, in this device's language. */
export function formatTarget(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    useGrouping: false,
    numberingSystem: "latn",
  }).format(value);
}
