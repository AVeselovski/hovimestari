import { z } from "zod";

// The one figure computation. The server answers every figure through these
// functions, and the web's live preview calls the same ones, so a preview is
// the figure that is saved. Everything is computed in integers: a basis in
// thousandths, grams in tenths, counts in hundredths, one rounding per row,
// halves away from zero. Floating point gets real cases wrong: 4.02 g per
// 100 g at 250 g is exactly 10.05 g, and 4.02 * 250 / 100 is
// 10.049999999999999. The largest product, a 10000 kcal basis at a count of
// 100, is 10^12 in these units, well below 2^53.

/** Energy in kcal and the three macros in grams. */
export const FiguresSchema = z.object({
  energyKcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

/** Where a total stands against a range, and how far from the bound that matters. */
export const RangePositionSchema = z.object({
  /** below: under the lower bound. within: from the lower to the upper bound. above: past the upper bound. */
  position: z.enum(["below", "within", "above"]),
  /** below: to the lower bound. within: to the upper bound. above: past the upper bound. One decimal at most. */
  distance: z.number(),
});

export type Figures = z.infer<typeof FiguresSchema>;
export type RangePosition = z.infer<typeof RangePositionSchema>;

/**
 * What a basis is per: 100 g of a food, one saved meal, one serving of a
 * recipe, or the whole entry (an estimate). A serving uses the meal's
 * arithmetic under its own name.
 */
export type Scale =
  | { per: "100g"; grams: number }
  | { per: "meal"; count: number }
  | { per: "serving"; count: number }
  | { per: "whole" };

const KEYS = ["energyKcal", "proteinG", "carbsG", "fatG"] as const;

/** `v` as an integer count of 10^-`decimals`. Exact for a value with at most that many decimals. */
export const scaled = (v: number, decimals: number): number => Math.round(v * 10 ** decimals);

/** `n / d` rounded to an integer, halves away from zero, computed exactly for integers below 2^53. */
export function divRound(n: number, d: number): number {
  const sign = n < 0 ? -1 : 1;
  const a = Math.abs(n);
  let q = Math.floor(a / d);
  let r = a - q * d;
  // A float quotient can land one off; the remainder puts it right.
  if (r < 0) {
    q -= 1;
    r += d;
  } else if (r >= d) {
    q += 1;
    r -= d;
  }
  return sign * (2 * r >= d ? q + 1 : q);
}

/** The divisor that turns basis thousandths times the scale's amount units into units of the result. */
function amountOf(scale: Scale): { amount: number; divisor: number } {
  switch (scale.per) {
    case "100g":
      // thousandths x tenths of a gram / 100 g = 10^3 x 10 x 100
      return { amount: scaled(scale.grams, 1), divisor: 1_000_000 };
    case "meal":
    case "serving":
      // thousandths x hundredths of a count = 10^3 x 10^2
      return { amount: scaled(scale.count, 2), divisor: 100_000 };
    case "whole":
      return { amount: 1, divisor: 1_000 };
  }
}

/** One entry's figures, computed exactly in integers and rounded once: kcal whole, grams to one decimal, halves away from zero. */
export function entryFigures(basis: Figures, scale: Scale): Figures {
  const { amount, divisor } = amountOf(scale);
  const product = (v: number) => scaled(v, 3) * amount;
  return {
    energyKcal: divRound(product(basis.energyKcal), divisor),
    proteinG: divRound(product(basis.proteinG), divisor / 10) / 10,
    carbsG: divRound(product(basis.carbsG), divisor / 10) / 10,
    fatG: divRound(product(basis.fatG), divisor / 10) / 10,
  };
}

/** A day's total: the sum of its rows' rounded figures, summed in integer tenths, so the rows always add up to it. */
export function totalOf(rows: Figures[]): Figures {
  const tenths = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const row of rows) for (const key of KEYS) tenths[key] += scaled(row[key], 1);
  return {
    energyKcal: tenths.energyKcal / 10,
    proteinG: tenths.proteinG / 10,
    carbsG: tenths.carbsG / 10,
    fatG: tenths.fatG / 10,
  };
}

/** Where a total stands against a range, compared and subtracted in integer tenths. */
export function positionOf(total: number, range: { lower: number; upper: number }): RangePosition {
  const t = scaled(total, 1);
  const lower = scaled(range.lower, 1);
  const upper = scaled(range.upper, 1);
  if (t < lower) return { position: "below", distance: (lower - t) / 10 };
  if (t <= upper) return { position: "within", distance: (upper - t) / 10 };
  return { position: "above", distance: (t - upper) / 10 };
}

/** A portion count in grams, to one decimal, halves away from zero: 2.5 x 55 g = 137.5 g. */
export function gramsForPortion(count: number, portionGrams: number): number {
  // hundredths x tenths = thousandths of a gram; to tenths divide by 100.
  return divRound(scaled(count, 2) * scaled(portionGrams, 1), 100) / 10;
}
