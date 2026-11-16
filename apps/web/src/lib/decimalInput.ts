// ---------------------------------------------------------------------------
// The one parser for a number a person types: a target, a weight, a value
// from a food's label. Number fields are `type="text"` with an `inputMode`,
// because `type="number"` refuses the comma a Finnish keypad types. The
// decimal separator is a comma or a point, whatever the device's language,
// because the keyboard's layout is independent of it.
//
// No sign and no grouping: "-1" and "1.234,5" are refused, because a
// grouping separator cannot be told from a decimal one without guessing the
// locale. Display never groups digits either (lib/targetFormat.ts), so what
// the app shows can always be typed back.
//
// Lifted from finanssi's `parseAmountInput.ts`, with the sign removed and a
// cap on decimals added.
// ---------------------------------------------------------------------------

export interface DecimalInputOptions {
  /** The most decimals the number may have. More is refused, never rounded. */
  maxDecimals: number;
}

/** What a typed string holds: nothing, something that is not a number, or a number. */
export type ParsedDecimal = { kind: "empty" } | { kind: "invalid" } | { kind: "number"; value: number };

/** Digits, at most one "," or ".", digits. Either side may be empty, not both. */
const BODY = /^(\d*)[.,]?(\d*)$/;

/**
 * How many decimals a fraction counts for. Trailing zeros add none, so
 * "120.50" is 120.5 and fits one decimal. A fraction of exactly three digits
 * counts as written: after a comma or a point it may be a thousands group,
 * and "2,000" read as 2 is a silent misreading where a refusal is not. Under
 * one decimal it stays refused, as typed.
 */
function decimalsOf(fraction: string): number {
  return fraction.length === 3 ? 3 : fraction.replace(/0+$/, "").length;
}

export function parseDecimalInput(raw: string, { maxDecimals }: DecimalInputOptions): ParsedDecimal {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  const match = BODY.exec(text);
  if (!match) return { kind: "invalid" };
  const [, whole, fraction] = match;
  if (whole === "" && fraction === "") return { kind: "invalid" };
  if (decimalsOf(fraction) > maxDecimals) return { kind: "invalid" };
  const value = Number(`${whole === "" ? "0" : whole}.${fraction === "" ? "0" : fraction}`);
  return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
}
