import { describe, expect, it } from "@jest/globals";
import { averageOf, entryFigures, gramsForPortion, positionOf, totalOf, type Figures } from "../index.js";

// The one figure computation the server and the web's live preview share.
// Each case is a number a float implementation gets wrong, or one the
// design pins by name.

const figures = (energyKcal: number, proteinG: number, carbsG = 0, fatG = 0): Figures => ({
  energyKcal,
  proteinG,
  carbsG,
  fatG,
});

describe("entryFigures", () => {
  it("scales a saved meal by its count: Artur's snack, 2.5 meals of 60 kcal and 8 g", () => {
    const result = entryFigures(figures(60, 8, 4.2, 1.5), { per: "meal", count: 2.5 });
    expect(result).toEqual({ energyKcal: 150, proteinG: 20, carbsG: 10.5, fatG: 3.8 });
    // Never the per-meal figures and never the count itself.
    expect(result.energyKcal).not.toBe(60);
    expect(result.proteinG).not.toBe(8);
    expect(result.energyKcal).not.toBe(2.5);
    expect(result.proteinG).not.toBe(2.5);
  });

  it("scales a food per 100 g: quark at 250 g, 59.31 kcal and 10.5 g per 100 g", () => {
    expect(entryFigures(figures(59.31, 10.5, 3.6, 0.2), { per: "100g", grams: 250 })).toEqual({
      energyKcal: 148,
      proteinG: 26.3,
      carbsG: 9,
      fatG: 0.5,
    });
  });

  it("gets 4.02 g per 100 g at 250 g right: exactly 10.05 g, rounded half away from zero to 10.1", () => {
    // 4.02 * 250 / 100 in floating point is 10.049999999999999, which rounds to 10.0.
    expect(entryFigures(figures(0, 4.02), { per: "100g", grams: 250 }).proteinG).toBe(10.1);
  });

  it("rounds kcal to a whole number and grams to one decimal, halves away from zero", () => {
    expect(entryFigures(figures(1, 0.25), { per: "100g", grams: 50 })).toEqual(figures(1, 0.1, 0, 0));
    expect(entryFigures(figures(1, 0.35), { per: "100g", grams: 100 })).toEqual(figures(1, 0.4, 0, 0));
    expect(entryFigures(figures(0.5, 0.05), { per: "whole" })).toEqual(figures(1, 0.1, 0, 0));
    expect(entryFigures(figures(0.49, 0.049), { per: "100g", grams: 100 })).toEqual(figures(0, 0, 0, 0));
  });

  it("answers an estimate's own figures, kcal whole", () => {
    expect(entryFigures(figures(850.5, 42.3, 90, 30.1), { per: "whole" })).toEqual(figures(851, 42.3, 90, 30.1));
  });

  it("stays exact at the largest values the limits allow", () => {
    expect(entryFigures(figures(10000, 1000, 1000, 1000), { per: "meal", count: 100 })).toEqual(
      figures(1_000_000, 100_000, 100_000, 100_000),
    );
    expect(entryFigures(figures(999.99, 99.999), { per: "100g", grams: 5000 })).toEqual(figures(50000, 5000, 0, 0));
  });
});

describe("totalOf", () => {
  it("sums the rows' rounded figures: three rows of 0.35 g show 0.4 g each and total 1.2 g", () => {
    const row = entryFigures(figures(0, 0.35), { per: "100g", grams: 100 });
    expect(row.proteinG).toBe(0.4);
    const total = totalOf([row, row, row]);
    expect(total.proteinG).toBe(1.2);
    // The rounded exact sum would be 1.1. Float addition of 0.4 three times gives 1.2000000000000002.
    expect(total.proteinG).not.toBe(1.1);
  });

  it("answers exact tenths where float addition drifts", () => {
    expect(totalOf([figures(1, 0.1), figures(2, 0.2)])).toEqual(figures(3, 0.3, 0, 0));
  });

  it("answers zeros for no rows", () => {
    expect(totalOf([])).toEqual(figures(0, 0, 0, 0));
  });
});

describe("positionOf", () => {
  const protein = { lower: 130, upper: 180 };

  it("is below the floor by 0.1 exactly at 129.9 g", () => {
    expect(positionOf(129.9, protein)).toEqual({ position: "below", distance: 0.1 });
  });

  it("is within with 50.0 to the upper bound at 130.0 g", () => {
    expect(positionOf(130.0, protein)).toEqual({ position: "within", distance: 50 });
  });

  it("is above by 0.1 at 180.1 g", () => {
    expect(positionOf(180.1, protein)).toEqual({ position: "above", distance: 0.1 });
  });

  it("is within at the upper bound itself, with zero to go", () => {
    expect(positionOf(180, protein)).toEqual({ position: "within", distance: 0 });
  });

  it("answers a kcal distance that ends in .5: 1240 against an upper bound of 2199.5 is within by 959.5", () => {
    expect(positionOf(1240, { lower: 1000, upper: 2199.5 })).toEqual({ position: "within", distance: 959.5 });
  });

  it("works with equal bounds", () => {
    expect(positionOf(2000, { lower: 2000, upper: 2000 })).toEqual({ position: "within", distance: 0 });
    expect(positionOf(1999, { lower: 2000, upper: 2000 })).toEqual({ position: "below", distance: 1 });
  });
});

describe("gramsForPortion", () => {
  it("multiplies a count by the portion's grams: 2.5 x 55 g is 137.5 g", () => {
    expect(gramsForPortion(2.5, 55)).toBe(137.5);
  });

  it("rounds to one decimal, halves away from zero", () => {
    expect(gramsForPortion(0.25, 12.2)).toBe(3.1); // 3.05 exactly
    expect(gramsForPortion(1.15, 10)).toBe(11.5);
    expect(gramsForPortion(0.33, 100)).toBe(33);
  });
});

describe("averageOf", () => {
  it("averages kcal to a whole number, halves away from zero: 2001 and 2002 give 2002, never 2001", () => {
    expect(averageOf([figures(2001, 0), figures(2002, 0)]).energyKcal).toBe(2002);
  });

  it("averages grams to one decimal, halves away from zero: 100.0 and 100.1 g give 100.1", () => {
    expect(averageOf([figures(0, 100), figures(0, 100.1)]).proteinG).toBe(100.1);
  });

  it("rounds a third down: 2000, 2000 and 2001 kcal give 2000", () => {
    expect(averageOf([figures(2000, 0), figures(2000, 0), figures(2001, 0)]).energyKcal).toBe(2000);
  });

  it("gets 2.3 and 2.4 g right: exactly 2.35, so 2.4, where the float average is 2.3499999999999996", () => {
    expect((2.3 + 2.4) / 2).toBe(2.3499999999999996);
    expect(averageOf([figures(0, 2.3), figures(0, 2.4)]).proteinG).toBe(2.4);
  });

  it("averages every key the same way, and one total is itself", () => {
    expect(averageOf([figures(2050, 142.3, 0.1, 10), figures(1980, 135.5, 0.2, 20.1)])).toEqual(
      figures(2015, 138.9, 0.2, 15.1),
    );
    expect(averageOf([figures(2013, 135.4, 1.1, 2.2)])).toEqual(figures(2013, 135.4, 1.1, 2.2));
  });

  it("refuses no totals at all, so a caller that skips the empty case fails loudly", () => {
    expect(() => averageOf([])).toThrow();
  });
});
