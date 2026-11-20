import { describe, expect, it } from "@jest/globals";
import { RecipeFieldChangeSchema } from "../assistantChanges.js";

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
