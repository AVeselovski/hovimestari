import { describe, expect, it } from "@jest/globals";
import { entryFigures, filterRecipes, fold, sortRecipes, type RecipeSummary } from "../index.js";

// Finding recipes, as the web filters them on the device and list_recipes
// filters them for an assistant: the same function on both sides.

let n = 0;
const recipe = (name: string, over: Partial<RecipeSummary> = {}): RecipeSummary => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    servings: 2,
    timeMinutes: null,
    tags: [],
    favourite: false,
    archived: false,
    perServing: { energyKcal: 400, proteinG: 20, carbsG: 30, fatG: 10 },
    basis: { energyKcal: 400, proteinG: 20, carbsG: 30, fatG: 10 },
    lastPutOn: null,
    lastServings: null,
    imageId: null,
    foodsGone: false,
    ...over,
  };
};

const names = (list: RecipeSummary[]) => list.map((r) => r.name);
const active = { archived: false };

describe("filterRecipes", () => {
  const pahkina = recipe("Pähkinäpuuro", { tags: ["Aamiainen"] });
  const shakshuka = recipe("Shakshuka", { tags: ["Brunch", "Quick"] });
  const lohi = recipe("Lohikeitto", { tags: ["Brunch"], favourite: true });
  const old = recipe("Vanha keitto", { archived: true });
  const all = [pahkina, shakshuka, lohi, old];

  it("finds every word in the name or a tag, case and accents folded", () => {
    expect(names(filterRecipes(all, { ...active, q: "pahkina" }))).toEqual(["Pähkinäpuuro"]);
    expect(names(filterRecipes(all, { ...active, q: "brunch keitto" }))).toEqual(["Lohikeitto"]);
    expect(names(filterRecipes(all, { ...active, q: "aamiainen" }))).toEqual(["Pähkinäpuuro"]);
  });

  it("keeps the active or the archived ones", () => {
    expect(names(filterRecipes(all, active))).toEqual(["Pähkinäpuuro", "Shakshuka", "Lohikeitto"]);
    expect(names(filterRecipes(all, { archived: true }))).toEqual(["Vanha keitto"]);
  });

  it("asks for a tag as a tag is kept: an accent makes another tag, though a typed word finds both", () => {
    const haat = recipe("Kakku", { tags: ["Haat"] });
    const haeaet = recipe("Juhlakeitto", { tags: ["Häät"] });
    expect(names(filterRecipes([haat, haeaet], { ...active, tags: ["Häät"] }))).toEqual(["Juhlakeitto"]);
    expect(names(filterRecipes([haat, haeaet], { ...active, tags: ["haat"] }))).toEqual(["Kakku"]);
    expect(names(filterRecipes([haat, haeaet], { ...active, q: "haat" }))).toEqual(["Kakku", "Juhlakeitto"]);
  });

  it("keeps a recipe with all the tags asked for, without case", () => {
    expect(names(filterRecipes(all, { ...active, tags: ["brunch"] }))).toEqual(["Shakshuka", "Lohikeitto"]);
    expect(names(filterRecipes(all, { ...active, tags: ["Brunch", "Quick"] }))).toEqual(["Shakshuka"]);
  });

  it("keeps the favourites alone when asked", () => {
    expect(names(filterRecipes(all, { ...active, favourites: true }))).toEqual(["Lohikeitto"]);
    expect(filterRecipes(all, { ...active, favourites: false })).toHaveLength(3);
  });

  it("compares figures as shown: a recipe at 29.95 g, shown 30.0, is kept by at least 30", () => {
    const basis = { energyKcal: 300, proteinG: 29.95, carbsG: 0, fatG: 0 };
    const shown = recipe("Rahka", { basis, perServing: entryFigures(basis, { per: "serving", count: 1 }) });
    const lower = { ...basis, proteinG: 29.94 };
    const under = recipe("Puuro", { basis: lower, perServing: entryFigures(lower, { per: "serving", count: 1 }) });
    expect([shown.perServing.proteinG, under.perServing.proteinG]).toEqual([30, 29.9]);
    expect(names(filterRecipes([shown, under], { ...active, minProteinG: 30 }))).toEqual(["Rahka"]);
    expect(names(filterRecipes([shown, under], { ...active, maxProteinG: 29.9 }))).toEqual(["Puuro"]);
    expect(names(filterRecipes([shown, under], { ...active, minEnergyKcal: 300, maxEnergyKcal: 300 }))).toEqual([
      "Rahka",
      "Puuro",
    ]);
    expect(filterRecipes([shown], { ...active, maxEnergyKcal: 299 })).toEqual([]);
  });

  it("rounds the figure to what is shown and never the bound", () => {
    const basis = { energyKcal: 300, proteinG: 22.3, carbsG: 0, fatG: 0 };
    const shown = recipe("Munakas", { basis, perServing: entryFigures(basis, { per: "serving", count: 1 }) });
    expect(filterRecipes([shown], { ...active, minProteinG: 22.34 })).toEqual([]);
    expect(filterRecipes([shown], { ...active, maxProteinG: 22.26 })).toEqual([]);
    expect(filterRecipes([shown], { ...active, minProteinG: 22.3, maxProteinG: 22.3 })).toEqual([shown]);
    expect(filterRecipes([shown], { ...active, minProteinG: 0.3 })).toEqual([shown]);
  });
});

describe("sortRecipes", () => {
  it("sorts by name in Finnish order, å ä ö after z", () => {
    const list = [recipe("Örkki"), recipe("Ääni"), recipe("Zeta"), recipe("Åland"), recipe("Aamu")];
    expect(names(sortRecipes(list, "name"))).toEqual(["Aamu", "Zeta", "Åland", "Ääni", "Örkki"]);
  });

  it("sorts by the last day, latest first, never put on a day last, ties by name", () => {
    const list = [
      recipe("Never"),
      recipe("Bravo", { lastPutOn: "2026-11-21" }),
      recipe("Alfa", { lastPutOn: "2026-11-21" }),
      recipe("Old", { lastPutOn: "2026-10-01" }),
      recipe("Also never"),
    ];
    expect(names(sortRecipes(list, "lastPutOn"))).toEqual(["Alfa", "Bravo", "Old", "Also never", "Never"]);
  });

  it("sorts by protein, most first, and by energy, fewest first, ties by name", () => {
    const at = (name: string, energyKcal: number, proteinG: number) =>
      recipe(name, { perServing: { energyKcal, proteinG, carbsG: 0, fatG: 0 } });
    const list = [at("C", 500, 20), at("B", 300, 40), at("A", 500, 40)];
    expect(names(sortRecipes(list, "protein"))).toEqual(["A", "B", "C"]);
    expect(names(sortRecipes(list, "energy"))).toEqual(["B", "A", "C"]);
  });

  it("answers a new array and leaves the one given as it was", () => {
    const list = [recipe("B"), recipe("A")];
    expect(names(sortRecipes(list, "name"))).toEqual(["A", "B"]);
    expect(names(list)).toEqual(["B", "A"]);
  });
});

describe("fold", () => {
  it("lowers the case and takes the accents off", () => {
    expect(fold("Pähkinä Ö")).toBe("pahkina o");
  });
});
