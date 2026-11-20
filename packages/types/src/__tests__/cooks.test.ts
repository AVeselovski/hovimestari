import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { AssistantEntryLineSchema } from "../assistantChanges.js";
import { CookBodySchema, cookDiff, cookDiffers, type DiffLine } from "../cooks.js";

// What a batch changed from its recipe, and the body of a batch logged as
// made. A note is not a change, the order of the lines is not a change, and
// a line naming a recipe line the recipe no longer holds was added.

const line = (over: Partial<DiffLine> = {}): DiffLine => ({
  id: randomUUID(),
  foodId: randomUUID(),
  grams: 100,
  written: null,
  name: null,
  ...over,
});
const asMade = (l: DiffLine, over: Partial<DiffLine> = {}) => ({ ...l, id: randomUUID(), fromLineId: l.id, ...over });

describe("cookDiff", () => {
  const egg = line();
  const feta = line({ written: { amount: 1, unit: "pack" } });
  const salt = line({ foodId: null, grams: null, name: "Salt" });
  const recipe = [egg, feta, salt];

  it("finds nothing in a batch made as written, in any order", () => {
    const diff = cookDiff(recipe, 2, [asMade(salt), asMade(feta), asMade(egg)], 2);
    expect(diff).toEqual({ servings: null, changed: [], added: [], leftOut: [] });
    expect(cookDiffers(diff)).toBe(false);
  });

  it("names a changed yield alone as a difference", () => {
    const diff = cookDiff(
      recipe,
      2,
      recipe.map((l) => asMade(l)),
      3,
    );
    expect(diff.servings).toEqual({ recipe: 2, cook: 3 });
    expect(cookDiffers(diff)).toBe(true);
  });

  it("names each changed part of a line, and the lines added and left out", () => {
    const other = randomUUID();
    const cook = [
      asMade(egg, { foodId: other, grams: 120 }),
      asMade(feta, { written: { amount: 2, unit: "pack" } }),
      asMade(salt, { name: "Sea salt" }),
      { ...line(), fromLineId: null },
    ];
    const diff = cookDiff(recipe, 2, cook, 2);
    expect(diff.changed).toEqual([
      { lineId: cook[0]!.id, fromLineId: egg.id, fields: ["food", "amount"] },
      { lineId: cook[1]!.id, fromLineId: feta.id, fields: ["written"] },
      { lineId: cook[2]!.id, fromLineId: salt.id, fields: ["name"] },
    ]);
    expect(diff.added).toEqual([cook[3]!.id]);
    expect(diff.leftOut).toEqual([]);
    expect(cookDiff(recipe, 2, [asMade(egg)], 2).leftOut).toEqual([feta.id, salt.id]);
  });

  it("counts a line naming a recipe line that is gone, or one already named, as added", () => {
    const gone = { ...line(), fromLineId: randomUUID() };
    const twice = asMade(egg);
    const diff = cookDiff(recipe, 2, [asMade(egg), twice, gone, asMade(feta), asMade(salt)], 2);
    expect(diff.added).toEqual([twice.id, gone.id]);
    expect(diff.changed).toEqual([]);
  });
});

describe("CookBodySchema", () => {
  const counted = { counted: true, foodId: randomUUID(), amount: { grams: 100 } };
  const body = (over: object = {}) => ({
    id: randomUUID(),
    recipeId: randomUUID(),
    date: "2026-11-21",
    servings: 3,
    lines: [{ id: randomUUID(), ...counted, fromLineId: randomUUID() }],
    attach: [randomUUID()],
    ...over,
  });
  const codeOf = (input: unknown) => {
    const parsed = CookBodySchema.safeParse(input);
    return parsed.success ? null : parsed.error.issues[0]!.message;
  };

  it("takes a batch with an entry attached, its line's fromLineId defaulting to null", () => {
    const parsed = CookBodySchema.parse(body({ lines: [{ id: randomUUID(), ...counted }] }));
    expect(parsed.lines[0]!.fromLineId).toBeNull();
    expect([parsed.add, parsed.attachStatus]).toEqual([[], []]);
  });

  it("refuses a batch with no entry, and a status for an entry it does not attach", () => {
    expect(codeOf(body({ attach: [] }))).toBe("cook_entries_required");
    expect(codeOf(body({ attachStatus: [{ id: randomUUID(), status: "eaten" }] }))).toBe("cook_entry_invalid");
  });

  it("refuses two lines from one recipe line, an entry attached and added at once, and a yield of 1.5", () => {
    const from = randomUUID();
    const twice = [1, 2].map(() => ({ id: randomUUID(), ...counted, fromLineId: from }));
    expect(codeOf(body({ lines: twice }))).toBe("invalid_request");
    const id = randomUUID();
    expect(codeOf(body({ attach: [id], add: [{ id, date: "2026-11-21", status: "planned", servings: 1 }] }))).toBe(
      "invalid_request",
    );
    expect(codeOf(body({ servings: 1.5 }))).toBe("recipe_servings_invalid");
  });
});

describe("AssistantEntryLineSchema, a recipe's servings", () => {
  const entry = { name: "Shakshuka", date: "2026-11-21", status: "eaten", kind: "recipe", figures: {} };
  const figures = { energyKcal: 365, proteinG: 21.8, carbsG: 9.9, fatG: 25.7 };

  it("reads a row recorded before cooks, with no asMade, and one logged as made", () => {
    const old = AssistantEntryLineSchema.parse({ ...entry, figures, amount: { servings: 1 } });
    expect(old.amount).toEqual({ servings: 1 });
    const made = AssistantEntryLineSchema.parse({ ...entry, figures, amount: { servings: 1, asMade: true } });
    expect(made.amount).toEqual({ servings: 1, asMade: true });
  });
});
