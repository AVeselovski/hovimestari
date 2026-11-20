import { divRound, scaled, type Figures } from "./figures.js";

// A recipe's figures, by the one computation the server runs for every
// recipe and the web runs for a live preview, so a preview is the figure that
// is saved. A recipe's basis is one serving at the precision an entry stores.
// Its figures then come from `entryFigures(basis, { per: "serving", count })`,
// so "whole" and N servings logged as one entry are the same number.

/** A counted line: its food's values per 100 g and its weight. Lines not counted are not passed in. */
export interface CountedLine {
  per100g: Figures;
  grams: number;
}

const KEYS = ["energyKcal", "proteinG", "carbsG", "fatG"] as const;

/**
 * The figures of one serving of a batch of `servings`, from its counted
 * lines: the exact sum over the lines in integers (per 100 g in thousandths
 * times grams in tenths, so millionths of a unit), divided by the servings
 * and rounded once, halves away from zero, to the precision the entry
 * columns hold: kcal to two decimals, grams to three. The largest sum, 60
 * lines of 5000 g at 1000 kcal per 100 g, is 3 x 10^12, well below 2^53.
 */
export function recipeBasis(lines: readonly CountedLine[], servings: number): Figures {
  const sums = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const line of lines) {
    const grams = scaled(line.grams, 1);
    for (const key of KEYS) sums[key] += scaled(line.per100g[key], 3) * grams;
  }
  // The sums are in millionths of a unit. Per serving, to hundredths of a kcal and thousandths of a gram.
  const servingsUnits = scaled(servings, 2);
  return {
    energyKcal: divRound(sums.energyKcal * 100, servingsUnits * 10_000) / 100,
    proteinG: divRound(sums.proteinG * 100, servingsUnits * 1_000) / 1000,
    carbsG: divRound(sums.carbsG * 100, servingsUnits * 1_000) / 1000,
    fatG: divRound(sums.fatG * 100, servingsUnits * 1_000) / 1000,
  };
}

/** What `scaleRecipe` scales on a line: its grams, its portion count and its written amount. */
export interface ScalableLine {
  grams: number | null;
  portion: { count: number } | null;
  written: { amount: number } | null;
}

/** `v` times `to / from`, to `decimals` places, halves away from zero, in integers. */
const times = (v: number, decimals: number, to: number, from: number): number =>
  divRound(scaled(v, decimals) * scaled(to, 2), scaled(from, 2)) / 10 ** decimals;

/**
 * The lines of a batch of `from` servings scaled to `to`: grams to one
 * decimal, portion counts and written amounts to two. The figures of the
 * scaled batch come from the basis, never from these rounded amounts.
 */
export function scaleRecipe<L extends ScalableLine>(lines: readonly L[], from: number, to: number): L[] {
  return lines.map((line) => ({
    ...line,
    grams: line.grams === null ? null : times(line.grams, 1, to, from),
    portion: line.portion === null ? null : { ...line.portion, count: times(line.portion.count, 2, to, from) },
    written: line.written === null ? null : { ...line.written, amount: times(line.written.amount, 2, to, from) },
  }));
}
