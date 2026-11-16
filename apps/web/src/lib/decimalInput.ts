// ---------------------------------------------------------------------------
// The one parser for a number a person types: a target, a weight, a value
// from a food's label. Number fields are `type="text"` with an `inputMode`,
// because `type="number"` refuses the comma a Finnish keypad types. The
// decimal separator is a comma or a point, whatever the device's language,
// because the keyboard's layout is independent of it.
//
// No sign and no grouping: "-1" and "1.234,5" are refused, because a
// grouping separator cannot be told from a decimal one without guessing the
// locale. For the same reason a number that may be one thousands group,
// "2,000" or "1.500", is refused in every field, also one that allows three
// decimals: read as 2 or 1.5 it would be a silent misreading. Leading zeros
// do not get around it: "012,345" is "12,345". So a value of 1 or more
// cannot be typed with a third decimal. Display never groups digits either
// (lib/targetFormat.ts), so what the app shows can always be typed back.
//
// Lifted from finanssi's `parseAmountInput.ts`, with the sign removed and a
// cap on decimals added.
// ---------------------------------------------------------------------------

export interface DecimalInputOptions {
  /** The most decimals the number may have. More is refused, never rounded. */
  maxDecimals: number;
}

/**
 * What a typed string holds: nothing, something that is not a number, a
 * number, or a number that may hold a thousands group (`group`), such as
 * "2,000". A form shows `group` with a line of its own, so the reader learns
 * why, and treats it as not a number.
 */
export type ParsedDecimal =
  { kind: "empty" } | { kind: "invalid" } | { kind: "group" } | { kind: "number"; value: number };

/** Digits, at most one "," or ".", digits. Either side may be empty, not both. */
const BODY = /^(\d*)[.,]?(\d*)$/;

/**
 * Whether `whole` and `fraction` may be a number with a thousands group:
 * one to three digits, a separator, then exactly three digits. Leading zeros
 * are dropped first, so "012,345" counts as "12,345". "2,000" on an English
 * keypad is two thousand, "1.500" on a Finnish one is fifteen hundred.
 * "0,500" is not: no group follows a lone zero.
 */
function mayBeGroup(whole: string, fraction: string): boolean {
  const digits = whole.replace(/^0+(?=\d)/, "");
  return /^[1-9]\d{0,2}$/.test(digits) && fraction.length === 3;
}

/**
 * How many decimals a fraction counts for. One or two digits count without
 * their trailing zeros, so "120.50" is 120.5 and fits one decimal. Three
 * digits or more count as written: past two digits a trailing zero is
 * either a thousands group or padding, and a zero added to a group ("2,0000")
 * must not slip past the group rule.
 */
function decimalsOf(fraction: string): number {
  return fraction.length >= 3 ? fraction.length : fraction.replace(/0+$/, "").length;
}

/**
 * Reads a typed number. The rule is the same for every field: a fraction
 * that may be a thousands group is refused as `group` whatever the field's
 * decimals, a fraction of up to two digits counts without its trailing
 * zeros, a longer one counts every digit, and more decimals than
 * `maxDecimals` are refused, never rounded.
 */
export function parseDecimalInput(raw: string, { maxDecimals }: DecimalInputOptions): ParsedDecimal {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  const match = BODY.exec(text);
  if (!match) return { kind: "invalid" };
  const [, whole, fraction] = match;
  if (whole === "" && fraction === "") return { kind: "invalid" };
  if (mayBeGroup(whole, fraction)) return { kind: "group" };
  if (decimalsOf(fraction) > maxDecimals) return { kind: "invalid" };
  const value = Number(`${whole === "" ? "0" : whole}.${fraction === "" ? "0" : fraction}`);
  return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
}
