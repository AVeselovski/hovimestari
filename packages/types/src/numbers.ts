/**
 * Whether `v` is a finite number with at most `decimals` decimal places,
 * exactly: it must equal itself rounded to that many places. A value the
 * database would round, such as 0.00000001 for a one-decimal column, is refused.
 */
export function hasAtMostDecimals(v: number, decimals: number): boolean {
  return Number.isFinite(v) && Number(v.toFixed(decimals)) === v;
}
