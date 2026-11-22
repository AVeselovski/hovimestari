import { describe, expect, it } from "@jest/globals";
import { RecentItemSchema, RecentListSchema } from "../log.js";

// A recent item is a food, a saved meal or a recipe, each with the amount of
// the last time. The three kinds parse, and a kind's amount is its own.

const figures = { energyKcal: 365, proteinG: 21.8, carbsG: 9.9, fatG: 25.7 };
const id = "7d0c4b1e-6a3f-4f0a-9c55-2f6d8a1b3c4d";

const meal = {
  kind: "saved_meal",
  meal: { id, name: "Lounas", source: null, figures, archived: false, lastCount: 1 },
  last: { count: 1 },
};
const recipe = {
  kind: "recipe",
  recipe: {
    id,
    name: "Shakshuka",
    servings: 2,
    timeMinutes: null,
    tags: [],
    favourite: false,
    archived: false,
    perServing: figures,
    basis: figures,
    lastPutOn: "2026-11-21",
    lastServings: 1.5,
    imageId: null,
    foodsGone: false,
  },
  last: { servings: 1.5 },
};

describe("RecentItemSchema", () => {
  it("parses a recipe with the servings of the last time", () => {
    expect(RecentItemSchema.parse(recipe)).toEqual(recipe);
  });

  it("still parses a list of the kinds it held before", () => {
    expect(RecentListSchema.parse({ items: [meal] })).toEqual({ items: [meal] });
  });

  it("refuses a recipe with a meal's amount, and a kind it does not know", () => {
    expect(RecentItemSchema.safeParse({ ...recipe, last: { count: 1 } }).success).toBe(false);
    expect(RecentItemSchema.safeParse({ ...recipe, kind: "estimate" }).success).toBe(false);
  });
});
