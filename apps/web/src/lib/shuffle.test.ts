import { describe, it, expect } from "vitest";
import type { Recipe } from "@hovi/shared";
import { shuffle } from "./shuffle.js";

function makeRecipe(id: string, lastUsed?: string, category: "common" | "special" = "common"): Recipe {
  return {
    id,
    name: id,
    time: 20,
    servings: 4,
    category,
    ingredients: [],
    lastUsed,
  };
}

describe("shuffle", () => {
  it("only picks from common recipes", () => {
    const recipes: Recipe[] = [
      makeRecipe("a"),
      makeRecipe("b"),
      makeRecipe("c"),
      makeRecipe("s1", undefined, "special"),
      makeRecipe("s2", undefined, "special"),
    ];
    for (let i = 0; i < 30; i++) {
      const picks = shuffle(recipes, 2);
      expect(picks.every((id) => !id.startsWith("s"))).toBe(true);
    }
  });

  it("returns n distinct ids", () => {
    const recipes: Recipe[] = Array.from({ length: 8 }, (_, i) => makeRecipe(`r${i}`));
    const picks = shuffle(recipes, 3);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
  });

  it("prefers never-used recipes over used ones", () => {
    // 10 common recipes; 8 of them used very recently, 2 never-used.
    const now = Date.now();
    const recipes: Recipe[] = [
      makeRecipe("fresh1"),
      makeRecipe("fresh2"),
      ...Array.from({ length: 8 }, (_, i) =>
        makeRecipe(`used${i}`, new Date(now - i * 1000).toISOString()),
      ),
    ];
    // With n=2, candidates = top max(5, 4)=5 oldest. fresh1+fresh2 should be in there.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      for (const id of shuffle(recipes, 2)) seen.add(id);
    }
    expect(seen.has("fresh1")).toBe(true);
    expect(seen.has("fresh2")).toBe(true);
  });

  it("returns empty array when there are no common recipes", () => {
    const recipes: Recipe[] = [makeRecipe("s1", undefined, "special")];
    expect(shuffle(recipes, 2)).toEqual([]);
  });

  it("returns [] when common pool smaller than n (1 common, n=2)", () => {
    const recipes: Recipe[] = [
      makeRecipe("a"),
      makeRecipe("s1", undefined, "special"),
      makeRecipe("s2", undefined, "special"),
    ];
    expect(shuffle(recipes, 2)).toEqual([]);
  });

  it("returns [] when n=3 and pool has 2 common recipes", () => {
    const recipes: Recipe[] = [
      makeRecipe("a"),
      makeRecipe("b"),
      makeRecipe("s1", undefined, "special"),
    ];
    expect(shuffle(recipes, 3)).toEqual([]);
  });
});
