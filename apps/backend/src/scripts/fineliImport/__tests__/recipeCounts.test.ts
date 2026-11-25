import { describe, expect, it } from "@jest/globals";
import { countRecipes, countsOfTable } from "../recipeCounts.js";
import { RECIPE_COUNTS_R18 } from "../recipeCountsR18.js";

const row = (foodId: number, ingredientId: number) => ({ foodId, ingredientId });
const CLASSES = new Map([
  [10, "MILK"],
  [11, "EGG"],
  [20, "WATER"],
  [21, "SALT"],
]);

describe("countRecipes", () => {
  it("counts the distinct recipes that use a food, also when one lists it twice", () => {
    const { counts } = countRecipes([row(100, 10), row(100, 10), row(101, 10), row(101, 11)], CLASSES);
    expect(counts.get(10)).toEqual({ uses: 2, foods: null });
    expect(counts.get(11)).toEqual({ uses: 1, foods: null });
  });

  it("counts a recipe's rows besides water and salt", () => {
    const { counts } = countRecipes([row(100, 10), row(100, 11), row(100, 20), row(100, 21)], CLASSES);
    expect(counts.get(100)).toEqual({ uses: 0, foods: 2 });
    expect(counts.get(20)).toEqual({ uses: 1, foods: null });
  });

  it("counts a recipe's rows, not its distinct ingredients: an ingredient listed twice is two", () => {
    expect(countRecipes([row(100, 10), row(100, 10)], CLASSES).counts.get(100)).toEqual({ uses: 0, foods: 2 });
  });

  it("counts a recipe that names itself as one use and one food of that food", () => {
    expect(countRecipes([row(100, 100)], CLASSES).counts.get(100)).toEqual({ uses: 1, foods: 1 });
  });

  it("says how many rows it left out as water or salt", () => {
    const rows = [row(100, 10), row(100, 20), row(100, 21), row(101, 20), row(101, 999)];
    expect(countRecipes(rows, CLASSES).rowsNotFood).toBe(3);
    expect(countRecipes(rows, new Map()).rowsNotFood).toBe(0);
  });

  it("answers 0 foods for a recipe of water and salt alone, not null", () => {
    expect(countRecipes([row(100, 20), row(100, 21)], CLASSES).counts.get(100)).toEqual({ uses: 0, foods: 0 });
  });

  it("counts an ingredient the classes do not know as a food", () => {
    expect(countRecipes([row(100, 999), row(100, 20)], CLASSES).counts.get(100)?.foods).toBe(1);
  });

  it("gives a food that is both a recipe and an ingredient both counts", () => {
    const { counts } = countRecipes([row(100, 10), row(200, 100), row(201, 100)], CLASSES);
    expect(counts.get(100)).toEqual({ uses: 2, foods: 1 });
  });

  it("answers the foods in id order, and nothing for no rows", () => {
    expect([...countRecipes([row(300, 10), row(100, 11)], CLASSES).counts.keys()]).toEqual([10, 11, 100, 300]);
    expect(countRecipes([], CLASSES)).toEqual({ counts: new Map(), rowsNotFood: 0 });
  });
});

// The committed counts of release 18. These figures are the release's own
// (docs/design/food-search-ranking.md, section c), so a bad regeneration fails here.
describe("RECIPE_COUNTS_R18", () => {
  const { rows } = RECIPE_COUNTS_R18;
  const counts = countsOfTable(RECIPE_COUNTS_R18);

  it("names the release as its descript.txt does", () => {
    expect(RECIPE_COUNTS_R18.release).toBe("18.0");
  });

  // 2,556 of the 2,564 are foods an import of release 18 stores. The other eight are in its food.csv
  // without usable values, so the import leaves them out: 29, 11184 to 11187, 30801, 33484 and 33766.
  it("holds 2,564 foods, each once and in id order, 809 of them used by a recipe", () => {
    expect(rows).toHaveLength(2564);
    expect(counts.size).toBe(2564);
    const leftOut = new Set([29, 11184, 11185, 11186, 11187, 30801, 33484, 33766]);
    expect(rows.filter((r) => leftOut.has(r[0]))).toHaveLength(8);
    expect(rows.filter((r) => !leftOut.has(r[0]))).toHaveLength(2556);
    expect(rows.map((r) => r[0])).toEqual([...rows.map((r) => r[0])].sort((a, b) => a - b));
    expect(rows.filter((r) => r[1] > 0)).toHaveLength(809);
  });

  it("holds 1,968 recipes, and no row without either count", () => {
    expect(rows.filter((r) => r[2] !== null)).toHaveLength(1968);
    expect(rows.filter((r) => r[1] === 0 && r[2] === null)).toEqual([]);
    expect(rows.every((r) => r.every((n) => n === null || (Number.isInteger(n) && n >= 0)))).toBe(true);
  });

  it("holds the release's own figures for the foods the design names", () => {
    expect(counts.get(858)).toEqual({ uses: 395, foods: null });
    expect(Math.max(...rows.map((r) => r[1]))).toBe(1081);
    expect(counts.get(30)?.uses).toBe(1081);
    expect(counts.get(604)).toBeUndefined();
    expect(counts.get(29)).toEqual({ uses: 53, foods: 1 });
  });
});
