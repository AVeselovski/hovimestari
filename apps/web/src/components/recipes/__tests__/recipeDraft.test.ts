import { draftOf, liveFigures, readDraft, withAnsweredIds } from "../recipeDraft";
import { EGG, lineOf, shakshuka } from "./recipeFixtures";

// The editor's draft: the figures as typed, what a save sends, and the ids a
// save answers.

describe("the recipe draft", () => {
  it("computes the worked example's figures from its counted lines, the line not counted adding nothing", () => {
    const shak = shakshuka();
    const figures = liveFigures(draftOf(shak).lines, 2)!;
    expect(figures.basis).toEqual(shak.basis);
    expect(figures.perServing).toEqual({ energyKcal: 365, proteinG: 21.8, carbsG: 9.9, fatG: 25.7 });
    expect(figures.whole).toEqual({ energyKcal: 730, proteinG: 43.6, carbsG: 19.7, fatG: 51.4 });
    expect(liveFigures(draftOf(shak).lines, null)).toBeNull();
  });

  it("sends every field, the method as its non-empty lines and a blank time as none", () => {
    const draft = { ...draftOf(shakshuka()), method: " A. \n\n B.\n", time: " ", notes: "  ", tags: ["Brunch"] };
    const read = readDraft(draft);
    expect(read.ok && read.body).toMatchObject({
      steps: ["A.", "B."],
      timeMinutes: null,
      notes: null,
      tags: ["Brunch"],
    });
  });

  it("refuses servings that are not a whole number from 1 to 100, a time out of range and no lines", () => {
    const draft = draftOf(shakshuka());
    expect(readDraft({ ...draft, servings: "1.5" })).toEqual({
      ok: false,
      errors: { servings: "recipe_servings_invalid" },
    });
    expect(readDraft({ ...draft, time: "1441" })).toEqual({ ok: false, errors: { time: "recipe_time_invalid" } });
    expect(readDraft({ ...draft, lines: [], name: "" })).toEqual({
      ok: false,
      errors: { name: "name_required", lines: "recipe_lines_required" },
    });
  });

  it("takes the ids a save answers, line by line in the order sent", () => {
    const draft = draftOf(shakshuka());
    const answered = draft.lines.map((_, i) => lineOf({ food: EGG, grams: 1 }, i));
    expect(withAnsweredIds(draft.lines, answered).map((l) => l.id)).toEqual(answered.map((l) => l.id));
  });

  it("gives a copy new line ids", () => {
    const shak = shakshuka();
    const copy = draftOf(shak, true);
    expect(copy.lines.some((l) => shak.lines.some((s) => s.id === l.id))).toBe(false);
  });
});
