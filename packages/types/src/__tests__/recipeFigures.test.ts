import { describe, expect, it } from "@jest/globals";
import { entryFigures, recipeBasis, scaleRecipe, totalOf, type CountedLine, type Figures } from "../index.js";

// The worked example of the recipes design (c.3), pinned. Invented values per
// 100 g: a shakshuka of eggs, crushed tomatoes, feta and olive oil, serves 2.
// Salt is a line not counted, so it is never passed in.

const f = (energyKcal: number, proteinG: number, carbsG: number, fatG: number): Figures => ({
  energyKcal,
  proteinG,
  carbsG,
  fatG,
});

const SHAKSHUKA: CountedLine[] = [
  { per100g: f(143, 12.6, 0.7, 9.5), grams: 240 },
  { per100g: f(24, 1.2, 3.9, 0.2), grams: 400 },
  { per100g: f(264, 14.2, 4.1, 21.3), grams: 60 },
  { per100g: f(884, 0, 0, 100), grams: 15 },
];

const serving = (count: number) => ({ per: "serving" as const, count });

describe("recipeBasis: the worked example", () => {
  const basis = recipeBasis(SHAKSHUKA, 2);

  it("is one serving at the precision an entry stores", () => {
    // Exact sums 730.2 kcal, 43.56 g, 19.74 g and 51.38 g, halved.
    expect(basis).toEqual(f(365.1, 21.78, 9.87, 25.69));
  });

  it("shows one serving as 365 kcal, 21.8, 9.9 and 25.7", () => {
    expect(entryFigures(basis, serving(1))).toEqual(f(365, 21.8, 9.9, 25.7));
  });

  it("shows the whole as 730 kcal, 43.6, 19.7 and 51.4, never the lines rounded one by one", () => {
    const whole = entryFigures(basis, serving(2));
    expect(whole).toEqual(f(730, 43.6, 19.7, 51.4));
    const linesRounded = totalOf(SHAKSHUKA.map((l) => entryFigures(l.per100g, { per: "100g", grams: l.grams })));
    expect(linesRounded.proteinG).toBe(43.5);
    expect(whole.proteinG).not.toBe(43.5);
  });

  it("shows 3 servings as 1095 kcal, 65.3, 29.6 and 77.1, never three times the rounded serving", () => {
    const three = entryFigures(basis, serving(3));
    expect(three).toEqual(f(1095, 65.3, 29.6, 77.1));
    expect(three.proteinG).not.toBe(65.4);
  });

  it("set to serve 3: 243 kcal and 14.5 g a serving, three entries 43.5 g against a whole of 43.6 g", () => {
    const thirds = recipeBasis(SHAKSHUKA, 3);
    expect(thirds.energyKcal).toBe(243.4);
    expect(thirds.proteinG).toBe(14.52);
    const one = entryFigures(thirds, serving(1));
    expect(one).toMatchObject({ energyKcal: 243, proteinG: 14.5 });
    expect(totalOf([one, one, one]).proteinG).toBe(43.5);
    expect(entryFigures(thirds, serving(3)).proteinG).toBe(43.6);
  });
});

describe("recipeBasis: its edges", () => {
  it("counts nothing for no counted line", () => {
    expect(recipeBasis([], 4)).toEqual(f(0, 0, 0, 0));
  });

  it("keeps the largest sum exact: 60 lines of 5000 g at 1000 kcal and 100 g per 100 g", () => {
    const lines = Array.from({ length: 60 }, () => ({ per100g: f(1000, 100, 100, 100), grams: 5000 }));
    expect(recipeBasis(lines, 1)).toEqual(f(3_000_000, 300_000, 300_000, 300_000));
    expect(recipeBasis(lines, 7)).toEqual(f(428571.43, 42857.143, 42857.143, 42857.143));
  });

  it("rounds a half away from zero once, at the end", () => {
    // 0.001 kcal per 100 g at 50 g is 0.0005 kcal: 0.00 at two decimals only if rounded early.
    expect(recipeBasis([{ per100g: f(0.01, 0.001, 0, 0), grams: 50 }], 1)).toEqual(f(0.01, 0.001, 0, 0));
    expect(recipeBasis([{ per100g: f(0.01, 0, 0, 0), grams: 50 }], 1).energyKcal).toBe(0.01);
  });

  it("is exact where floating point is not: 4.02 g per 100 g at 250 g", () => {
    expect(recipeBasis([{ per100g: f(0, 4.02, 0, 0), grams: 250 }], 1).proteinG).toBe(10.05);
  });
});

describe("scaleRecipe", () => {
  const lines = [
    { id: "a", grams: 240, portion: { count: 4, unit: "KPL_M" }, written: { amount: 4, unit: "piece" } },
    { id: "b", grams: 15, portion: null, written: { amount: 1, unit: "tbsp" } },
    { id: "c", grams: null, portion: null, written: null },
  ];

  it("scales grams to one decimal, counts and written amounts to two, and keeps the rest", () => {
    expect(scaleRecipe(lines, 2, 3)).toEqual([
      { id: "a", grams: 360, portion: { count: 6, unit: "KPL_M" }, written: { amount: 6, unit: "piece" } },
      { id: "b", grams: 22.5, portion: null, written: { amount: 1.5, unit: "tbsp" } },
      { id: "c", grams: null, portion: null, written: null },
    ]);
  });

  it("rounds each to its places, halves away from zero", () => {
    const [scaled] = scaleRecipe([{ grams: 100, portion: { count: 1 }, written: { amount: 1 } }], 3, 1);
    expect(scaled).toEqual({ grams: 33.3, portion: { count: 0.33 }, written: { amount: 0.33 } });
    const [up] = scaleRecipe([{ grams: 0.5, portion: { count: 0.05 }, written: null }], 2, 1);
    expect(up).toEqual({ grams: 0.3, portion: { count: 0.03 }, written: null });
  });
});
