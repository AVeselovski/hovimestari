import type { SavedMeal } from "@hovimestari/types";
import { fold } from "@hovimestari/types";
import { activeSource, mealFilter, sortedSources, sourcesOf } from "../mealFilter";

const meal = (name: string, source: string | null): SavedMeal => ({
  id: name,
  name,
  source,
  figures: { energyKcal: 500, proteinG: 30, carbsG: 50, fatG: 20 },
  archived: false,
  lastCount: null,
});

const meals = [
  meal("Kanasalaatti", "Wolt"),
  meal("Pähkinäpuuro", null),
  meal("Chicken bowl", "Foodora"),
  meal("Lohikeitto", "Wolt"),
];
const names = (list: SavedMeal[]) => list.map((m) => m.name);

describe("mealFilter", () => {
  it("folds case and accents", () => {
    expect(fold("Pähkinä Ö")).toBe("pahkina o");
  });

  it("matches every typed word in the name or the source, folded", () => {
    expect(names(mealFilter(meals, "KANA"))).toEqual(["Kanasalaatti"]);
    expect(names(mealFilter(meals, "pahkina"))).toEqual(["Pähkinäpuuro"]);
    expect(names(mealFilter(meals, "wolt"))).toEqual(["Kanasalaatti", "Lohikeitto"]);
    expect(names(mealFilter(meals, "wolt keitto"))).toEqual(["Lohikeitto"]);
    expect(names(mealFilter(meals, "bowl wolt"))).toEqual([]);
  });

  it("keeps the meals of the chosen source alone, the query applied on top", () => {
    expect(names(mealFilter(meals, "", "Wolt"))).toEqual(["Kanasalaatti", "Lohikeitto"]);
    expect(names(mealFilter(meals, "lohi", "Wolt"))).toEqual(["Lohikeitto"]);
    expect(names(mealFilter(meals, "chicken", "Wolt"))).toEqual([]);
  });

  it("lists each source once, in Finnish order", () => {
    expect(sourcesOf([...meals, meal("Ämpäri", "Äijän keittiö"), meal("Zeta", "Zorro")])).toEqual([
      "Foodora",
      "Wolt",
      "Zorro",
      "Äijän keittiö",
    ]);
  });

  it("counts a chosen source only while its chips show and a meal still names it", () => {
    expect(activeSource(meals, "Wolt")).toBe("Wolt");
    expect(activeSource(meals, null)).toBeNull();
    // A source no meal names any more.
    expect(activeSource(meals, "Hesburger")).toBeNull();
    // One source left: no chips, so no filter in force that cannot be seen or cleared.
    expect(activeSource([meal("Kanasalaatti", "Wolt"), meal("Pähkinäpuuro", null)], "Wolt")).toBeNull();
  });
});

describe("sortedSources", () => {
  it("keeps each source once, in Finnish order, as the source chips list them", () => {
    expect(sortedSources(["Wolt", "Äitee", "Foodora", "Wolt", "Ö-baari"])).toEqual([
      "Foodora",
      "Wolt",
      "Äitee",
      "Ö-baari",
    ]);
  });
});
