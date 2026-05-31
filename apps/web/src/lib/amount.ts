// Countable units always render as integers in the shopping list (you cannot
// buy "1.5 pkt") but keep their fractional value through scaling math until
// the very last step. Anything outside this list is treated as a decimal —
// matches the spec verbatim; no fuzzy matching.
export const COUNTABLE_UNITS: readonly string[] = [
  "kpl",
  "pkt",
  "prk",
  "tlk",
  "rasia",
  "pss",
  "nippu",
  "kynttä",
];

export function isCountableUnit(unit: string): boolean {
  return COUNTABLE_UNITS.includes(unit.trim().toLowerCase());
}

export function scaleAmount(
  amount: number | null,
  planServings: number,
  baseServings: number,
): number | null {
  if (amount === null) return null;
  if (!Number.isFinite(planServings) || !Number.isFinite(baseServings)) return amount;
  if (baseServings <= 0) return amount;
  return (amount * planServings) / baseServings;
}

// Recipe-view formatting: up to 2 decimals, trim trailing zeros and a
// dangling decimal point. 1.0 -> "1", 1.25 -> "1.25", 0.5 -> "0.5".
export function formatRecipeAmount(amount: number | null): string {
  if (amount === null) return "";
  const rounded = Math.round(amount * 100) / 100;
  let s = rounded.toFixed(2);
  s = s.replace(/0+$/, "");
  s = s.replace(/\.$/, "");
  return s;
}

// Shopping-list formatting: round up for countable units, decimal for others.
export function formatShoppingAmount(amount: number | null, unit: string): string {
  if (amount === null) return "";
  if (isCountableUnit(unit)) {
    return String(Math.ceil(amount));
  }
  return formatRecipeAmount(amount);
}
