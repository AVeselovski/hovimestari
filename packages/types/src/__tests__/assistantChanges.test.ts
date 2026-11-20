import { describe, expect, it } from "@jest/globals";
import { AssistantChangeSummarySchema, RecipeFieldChangeSchema } from "../assistantChanges.js";

// The record of a recipe's method is counts and step numbers, so it takes no
// negative count and no step numbered below 1.

const steps = { field: "steps", from: 4, to: 5, added: 1, removed: 0, changed: [2], reordered: false };

describe("RecipeFieldChangeSchema, the method", () => {
  it("takes counts from 0 and steps numbered from 1", () => {
    expect(RecipeFieldChangeSchema.safeParse(steps).success).toBe(true);
    expect(RecipeFieldChangeSchema.safeParse({ ...steps, from: null, to: 0, added: 0 }).success).toBe(true);
  });

  it.each([
    ["a negative from", { from: -1 }],
    ["a negative to", { to: -1 }],
    ["a negative added", { added: -1 }],
    ["a negative removed", { removed: -1 }],
    ["a step numbered 0", { changed: [0] }],
  ])("refuses %s", (_, part) => {
    expect(RecipeFieldChangeSchema.safeParse({ ...steps, ...part }).success).toBe(false);
  });
});

// A batch's record holds what a batch can change, its servings and its
// lines, the lines it noted, and each entry with whether it was attached.
describe("the cook.logged summary", () => {
  const entry = {
    kind: "recipe",
    name: "Shakshuka",
    date: "2026-11-21",
    status: "planned",
    amount: { servings: 1, asMade: true },
    figures: { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  };
  const cook = {
    entity: "cook",
    recipeName: "Shakshuka",
    date: "2026-11-21",
    servings: 3,
    changes: [
      { field: "servings", from: 2, to: 3 },
      { field: "lines", added: [], removed: [{ name: "Oil", grams: 15 }], changed: [], reordered: false },
    ],
    lineNotes: ["Feta"],
    entries: [{ ...entry, attached: true }],
  };

  it("takes a batch's servings and lines", () => {
    expect(AssistantChangeSummarySchema.safeParse(cook).success).toBe(true);
  });

  it.each([
    ["a name change", { changes: [{ field: "name", from: "A", to: "B" }] }],
    ["a tags change", { changes: [{ field: "tags", from: null, to: ["Brunch"] }] }],
    ["servings with no recipe's servings", { changes: [{ field: "servings", from: null, to: 3 }] }],
    ["an entry that does not say whether it was attached", { entries: [entry] }],
    ["no lineNotes", { lineNotes: undefined }],
  ])("refuses %s", (_, part) => {
    expect(AssistantChangeSummarySchema.safeParse({ ...cook, ...part }).success).toBe(false);
  });

  it("lets a recipe saved from a batch name the batch, and a recipe made any other way leave it out", () => {
    const recipe = { entity: "recipe", name: "Shakshuka, spicy", changes: [] };
    expect(AssistantChangeSummarySchema.safeParse(recipe).success).toBe(true);
    const fromCook = { recipeName: "Shakshuka", date: "2026-11-21" };
    expect(AssistantChangeSummarySchema.safeParse({ ...recipe, fromCook }).success).toBe(true);
  });
});
