import type { Recipe, RecipeLine } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { editedChanges } from "../recipeChanges.js";

// The record's summary of a recipe edit, for the cases a real edit reaches
// only through a change made elsewhere: a portion renamed or replaced since
// the save. Each still names its line, and a line whose change none of the
// record's parts shows names the line with nothing else.

const EGG = "00000000-0000-4000-8000-000000000001";
const PORTION = "00000000-0000-4000-8000-0000000000a1";

const eggLine = (portion: Partial<NonNullable<RecipeLine["portion"]>> = {}): RecipeLine => ({
  id: EGG,
  position: 0,
  counted: true,
  food: {
    id: "00000000-0000-4000-8000-0000000000f1",
    name: "Oma kananmuna",
    source: "user",
    per100g: { energyKcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
    retired: false,
    deleted: false,
  },
  name: null,
  grams: 240,
  portion: { id: PORTION, unit: null, name: "egg", count: 4, ...portion },
  written: null,
  note: null,
});

const recipeWith = (lines: RecipeLine[]) =>
  ({ name: "Munakas", servings: 2, timeMinutes: null, lines, steps: [], notes: null, tags: [] }) as unknown as Recipe;

describe("editedChanges", () => {
  it("names a line whose own portion was renamed since, with the portion before and after", () => {
    expect(editedChanges(recipeWith([eggLine()]), recipeWith([eggLine({ name: "large egg" })]))).toEqual([
      {
        field: "lines",
        added: [],
        removed: [],
        changed: [
          {
            name: "Oma kananmuna",
            portion: { from: { count: 4, unit: null, name: "egg" }, to: { count: 4, unit: null, name: "large egg" } },
          },
        ],
        reordered: false,
      },
    ]);
  });

  it("names a line whose change no part of the record shows, with nothing else", () => {
    const other = eggLine({ id: "00000000-0000-4000-8000-0000000000a2" });
    expect(editedChanges(recipeWith([eggLine()]), recipeWith([other]))).toEqual([
      { field: "lines", added: [], removed: [], changed: [{ name: "Oma kananmuna" }], reordered: false },
    ]);
  });

  it("records nothing for lines that are the same", () => {
    expect(editedChanges(recipeWith([eggLine()]), recipeWith([eggLine()]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The method, compared by content: the steps both sides hold are lined up,
// so a step added, removed, reworded or moved is recorded as that, and the
// steps around it are not.
// ---------------------------------------------------------------------------

const METHOD = ["Fry the onion.", "Add the tomatoes.", "Simmer.", "Crack in the eggs.", "Crumble the feta."];
const stepsOf = (before: string[], after: string[]) =>
  editedChanges({ ...recipeWith([]), steps: before }, { ...recipeWith([]), steps: after });
const steps = (s: {
  from: number;
  to: number;
  added?: number;
  removed?: number;
  changed?: number[];
  reordered?: boolean;
}) => [{ field: "steps", added: 0, removed: 0, changed: [], reordered: false, ...s }];
const insert = (at: number, step: string, list = METHOD) => [...list.slice(0, at), step, ...list.slice(at)];

describe("editedChanges of the method", () => {
  it.each([
    ["at the start", 0],
    ["in the middle", 2],
    ["at the end", 5],
  ])("records a step added %s as one added, no step changed", (_, at) => {
    expect(stepsOf(METHOD, insert(at, "Warm the pan."))).toEqual(steps({ from: 5, to: 6, added: 1 }));
  });

  it("records a step removed as one removed", () => {
    expect(
      stepsOf(
        METHOD,
        METHOD.filter((_, i) => i !== 1),
      ),
    ).toEqual(steps({ from: 5, to: 4, removed: 1 }));
  });

  it("records a reworded step by its number", () => {
    const after = METHOD.map((s, i) => (i === 1 ? "Add the crushed tomatoes." : s));
    expect(stepsOf(METHOD, after)).toEqual(steps({ from: 5, to: 5, changed: [2] }));
  });

  it("records a step reworded and one added, the reworded one numbered as in the method after", () => {
    const after = insert(0, "Warm the pan.", METHOD).map((s) => (s === "Simmer." ? "Simmer for ten minutes." : s));
    expect(stepsOf(METHOD, after)).toEqual(steps({ from: 5, to: 6, added: 1, changed: [4] }));
  });

  it("records steps that only moved as the order changed", () => {
    const [a, b, ...rest] = METHOD;
    expect(stepsOf(METHOD, [b!, a!, ...rest])).toEqual(steps({ from: 5, to: 5, reordered: true }));
    expect(stepsOf(METHOD, [...METHOD].reverse())).toEqual(steps({ from: 5, to: 5, reordered: true }));
  });

  it("records a step removed in one place and another added elsewhere as one of each", () => {
    expect(stepsOf(METHOD, [...METHOD.slice(1), "Serve."])).toEqual(steps({ from: 5, to: 5, added: 1, removed: 1 }));
  });

  it("never numbers a new step as reworded: more steps came than left between two shared ones counts them", () => {
    // A new step put right before a reworded one, as when a step is split in two.
    expect(stepsOf(["Fry.", "Bake.", "Serve."], ["Warm the pan.", "Fry well.", "Bake.", "Serve."])).toEqual(
      steps({ from: 3, to: 4, added: 2, removed: 1 }),
    );
    expect(stepsOf(["Fry.", "Bake.", "Serve."], ["Fry well.", "Fry again.", "Bake.", "Serve."])).toEqual(
      steps({ from: 3, to: 4, added: 2, removed: 1 }),
    );
  });

  it("numbers the steps that came as reworded when more left than came, each of them a new text in a changed place", () => {
    expect(stepsOf(["Warm the pan.", "Fry.", "Bake.", "Serve."], ["Fry well.", "Bake.", "Serve."])).toEqual(
      steps({ from: 4, to: 3, removed: 1, changed: [1] }),
    );
  });

  it("tells two steps of the same text apart", () => {
    const risotto = ["Stir.", "Add the stock.", "Stir.", "Serve."];
    expect(stepsOf(risotto, insert(2, "Add the cheese.", risotto))).toEqual(steps({ from: 4, to: 5, added: 1 }));
    expect(stepsOf(risotto, ["Stir.", "Add the stock.", "Serve."])).toEqual(steps({ from: 4, to: 3, removed: 1 }));
    expect(stepsOf(risotto, ["Add the stock.", "Stir.", "Stir.", "Serve."])).toEqual(
      steps({ from: 4, to: 4, reordered: true }),
    );
  });

  it("records nothing for a method that is the same", () => {
    expect(stepsOf(METHOD, [...METHOD])).toEqual([]);
  });
});
