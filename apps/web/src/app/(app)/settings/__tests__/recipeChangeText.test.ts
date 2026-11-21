import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import type { AssistantChange, AssistantChangeSummary, RecipeLineChange } from "@hovimestari/types";
import { changeText, spokenText } from "../_components/changeText";
import { change, NOW, read, words } from "./changeTextFixtures";

// ---------------------------------------------------------------------------
// A recipe change as the Activity sheet reads it, from a summary of the
// shape the backend records ("R1a as built" in docs/design/recipes.md),
// through the real catalog. A recipe edit names only what differs: the
// lines added, removed or changed, which steps changed, that the notes
// changed. A row never reads the same value on both sides of a change.
// ---------------------------------------------------------------------------

beforeEach(() => {
  clockFrom(NOW);
  setTestLocale("en-GB");
});

afterEach(() => {
  jest.restoreAllMocks();
});

const recipe = (changes: unknown[]): AssistantChangeSummary =>
  ({ entity: "recipe", name: "Shakshuka", changes }) as AssistantChangeSummary;
const edited = (...changes: unknown[]) => read(change("recipe.changed", recipe(changes)));
const lines = (l: { added?: unknown[]; removed?: unknown[]; changed?: unknown[]; reordered?: boolean }) => ({
  field: "lines",
  added: [],
  removed: [],
  changed: [],
  reordered: false,
  ...l,
});
const egg = (change: Partial<RecipeLineChange>) => ({ name: "Kananmuna, keitetty", ...change });
const medium = (count: number) => ({ count, unit: "KPL_M" as const, name: null });

describe("create_recipe", () => {
  it("reads every line it set, the method as a count, and that it has notes", () => {
    const summary = recipe([
      { field: "servings", from: null, to: 2 },
      { field: "time", from: null, to: 25 },
      lines({
        added: [
          { name: "Kananmuna", grams: 240 },
          { name: "Fetajuusto", grams: 60.5 },
          { name: "Salt", grams: null },
        ],
      }),
      { field: "steps", from: null, to: 2, added: 2, removed: 0, changed: [], reordered: false },
      { field: "notes", change: "added" },
      { field: "tags", from: null, to: ["Brunch", "Quick"] },
    ]);
    expect(read(change("recipe.created", summary))).toEqual([
      "Created the recipe Shakshuka",
      "Servings: 2",
      "Time: 25 min",
      "Ingredients: Kananmuna 240 g · Fetajuusto 60.5 g · Salt",
      "Method: 2 steps",
      "Notes: added",
      "Tags: Brunch · Quick",
    ]);
  });

  it("spells out eight lines of a long recipe, then says how many more", () => {
    const added = Array.from({ length: 12 }, (_, i) => ({ name: `Food ${i + 1}`, grams: 10 }));
    const [, ...rest] = read(change("recipe.created", recipe([lines({ added })])));
    expect(rest).toEqual([
      `Ingredients: ${added
        .slice(0, 8)
        .map((l) => `${l.name} 10 g`)
        .join(" · ")}`,
      "And 4 more ingredients",
    ]);
  });

  it("spells out a ninth line rather than saying one more", () => {
    const added = Array.from({ length: 9 }, (_, i) => ({ name: `Food ${i + 1}`, grams: null }));
    const [, ...rest] = read(change("recipe.created", recipe([lines({ added })])));
    expect(rest).toEqual([`Ingredients: ${added.map((l) => l.name).join(" · ")}`]);
  });
});

describe("update_recipe", () => {
  it("reads servings, time and name before and after, the unit said once", () => {
    expect(
      edited(
        { field: "name", from: "Shakshuka for two", to: "Shakshuka" },
        { field: "servings", from: 3, to: 2 },
        { field: "time", from: 25, to: 30 },
      ),
    ).toEqual([
      "Changed the recipe Shakshuka",
      "Name: Shakshuka for two to Shakshuka",
      "Servings: 3 to 2",
      "Time: 25 to 30 min",
    ]);
    expect(edited({ field: "time", from: 25, to: null })).toEqual([
      "Changed the recipe Shakshuka",
      "Time: 25 min to none",
    ]);
    expect(edited({ field: "time", from: null, to: 30 })).toEqual([
      "Changed the recipe Shakshuka",
      "Time: none to 30 min",
    ]);
  });

  it("counts the rest after a list of removed lines as changes, one or many", () => {
    const removed = Array.from({ length: 11 }, (_, i) => ({ name: `Old ${i + 1}`, grams: null }));
    expect(edited(lines({ removed })).at(-1)).toBe("And 3 more ingredient changes");
    expect(edited(lines({ removed: removed.slice(0, 10) })).at(-1)).toBe("And 2 more ingredient changes");
  });

  it("names a line whose note alone changed, never two identical lists", () => {
    expect(edited(lines({ changed: [egg({ note: "added" })] }))).toEqual([
      "Changed the recipe Shakshuka",
      "Kananmuna, keitetty: note added",
    ]);
    expect(edited(lines({ changed: [egg({ note: "changed" })] }))[1]).toBe("Kananmuna, keitetty: note changed");
    expect(edited(lines({ changed: [egg({ note: "removed" })] }))[1]).toBe("Kananmuna, keitetty: note removed");
  });

  it("names a line whose portion count changed, with its grams", () => {
    const changed = [egg({ portion: { from: medium(4), to: medium(5) }, grams: { from: 240, to: 300 } })];
    expect(edited(lines({ changed }))[1]).toBe(
      "Kananmuna, keitetty: 4 × Medium piece to 5 × Medium piece · 240 g to 300 g",
    );
  });

  it("names a line whose amount went from grams to a portion", () => {
    const changed = [egg({ portion: { from: null, to: medium(4) } })];
    expect(edited(lines({ changed }))[1]).toBe("Kananmuna, keitetty: none to 4 × Medium piece");
  });

  it("names a line whose written amount changed", () => {
    const changed = [
      {
        name: "Valkosipuli",
        written: { from: { amount: 1, unit: "clove" }, to: { amount: 2.5, unit: "clove" } },
      },
      { name: "Oliiviöljy", written: { from: null, to: { amount: 1, unit: "tbsp" } } },
      { name: "Tomaattimurska", written: { from: { amount: 1, unit: "can" }, to: null } },
    ];
    expect(edited(lines({ changed })).slice(1)).toEqual([
      "Valkosipuli: as written 1 clove to 2.5 cloves",
      "Oliiviöljy: as written none to 1 tbsp",
      "Tomaattimurska: as written 1 can to none",
    ]);
  });

  it("names a line whose food changed, and says so in words when the two foods share a name", () => {
    expect(edited(lines({ changed: [{ name: "Tomaattimurska", food: { from: "Fetajuusto" } }] }))[1]).toBe(
      "Tomaattimurska: in place of Fetajuusto",
    );
    expect(edited(lines({ changed: [{ name: "Fetajuusto", food: { from: "Fetajuusto" } }] }))[1]).toBe(
      "Fetajuusto: another food",
    );
  });

  it("says a line changed in plain words when nothing it would show differs", () => {
    expect(edited(lines({ changed: [egg({})] }))[1]).toBe("Kananmuna, keitetty: changed");
    expect(edited(lines({ changed: [egg({ portion: { from: medium(4), to: medium(4) } })] }))[1]).toBe(
      "Kananmuna, keitetty: changed",
    );
  });

  it("lists the lines added and removed, and says when only the order changed", () => {
    expect(
      edited(
        lines({
          added: [
            { name: "Tomaattimurska", grams: 200 },
            { name: "Sipuli", grams: 80 },
          ],
          removed: [{ name: "Salt", grams: null }],
        }),
      ),
    ).toEqual([
      "Changed the recipe Shakshuka",
      "Ingredients added: Tomaattimurska 200 g · Sipuli 80 g",
      "Ingredient removed: Salt",
    ]);
    expect(edited(lines({ reordered: true }))).toEqual(["Changed the recipe Shakshuka", "Ingredients: order changed"]);
    expect(edited(lines({}))).toEqual(["Changed the recipe Shakshuka", "Ingredients: changed"]);
  });

  it("spells out eight changed lines, then counts the rest as changes, never as more of the last list", () => {
    const added = Array.from({ length: 5 }, (_, i) => ({ name: `New ${i + 1}`, grams: 10 }));
    const changed = Array.from({ length: 6 }, (_, i) => ({ name: `Kept ${i + 1}`, note: "added" }));
    expect(edited(lines({ added, changed })).slice(1)).toEqual([
      "Ingredients added: New 1 10 g · New 2 10 g · New 3 10 g · New 4 10 g · New 5 10 g",
      "Kept 1: note added",
      "Kept 2: note added",
      "Kept 3: note added",
      "And 3 more ingredient changes",
    ]);
  });

  const steps = (s: {
    from: number;
    to: number;
    added?: number;
    removed?: number;
    changed?: number[];
    reordered?: boolean;
  }) => edited({ field: "steps", added: 0, removed: 0, changed: [], reordered: false, ...s })[1];

  it("reads a step added or removed by the method's counts alone, never as steps changed", () => {
    expect(steps({ from: 5, to: 6, added: 1 })).toBe("Method: 5 steps to 6 steps");
    expect(steps({ from: 5, to: 4, removed: 1 })).toBe("Method: 5 steps to 4 steps");
    expect(steps({ from: 1, to: 0, removed: 1 })).toBe("Method: 1 step to none");
    expect(steps({ from: 0, to: 2, added: 2 })).toBe("Method: none to 2 steps");
  });

  it("reads the steps reworded by number, beside a step added", () => {
    expect(steps({ from: 5, to: 5, changed: [2] })).toBe("Method: step 2 changed");
    expect(steps({ from: 5, to: 5, changed: [1, 3] })).toBe("Method: 2 steps changed");
    expect(steps({ from: 5, to: 6, added: 1, changed: [4] })).toBe("Method: 5 steps to 6 steps · step 4 changed");
  });

  it("reads steps that only moved as the order changed", () => {
    expect(steps({ from: 5, to: 5, reordered: true })).toBe("Method: order changed");
    expect(steps({ from: 5, to: 6, added: 1, reordered: true })).toBe("Method: 5 steps to 6 steps · order changed");
  });

  it("reads a step added and another removed as one of each, never two equal counts", () => {
    expect(steps({ from: 5, to: 5, added: 1, removed: 1 })).toBe("Method: 1 step added · 1 step removed");
    expect(steps({ from: 5, to: 4, added: 1, removed: 2 })).toBe(
      "Method: 5 steps to 4 steps · 1 step added · 2 steps removed",
    );
  });

  it("reads an edit whose record names no field by its headline alone", () => {
    expect(edited()).toEqual(["Changed the recipe Shakshuka"]);
  });

  it("reads the notes as added, changed or removed, never their text", () => {
    expect(edited({ field: "notes", change: "changed" })[1]).toBe("Notes: changed");
    expect(edited({ field: "notes", change: "removed" })[1]).toBe("Notes: removed");
    expect(edited({ field: "notes", change: "added" })[1]).toBe("Notes: added");
  });

  it("reads tags before and after", () => {
    expect(edited({ field: "tags", from: ["Brunch", "Weekend"], to: [] }).slice(1)).toEqual([
      "Tags, before: Brunch · Weekend",
      "Tags, after: none",
    ]);
  });
});

describe("log_cook", () => {
  const entry = (date: string, status: "planned" | "eaten", attached: boolean) => ({
    name: "Shakshuka",
    date,
    status,
    kind: "recipe",
    amount: { servings: 1, asMade: true },
    figures: { energyKcal: 241, proteinG: 17.2, carbsG: 8.1, fatG: 15.1 },
    attached,
  });
  const cook = (changes: unknown[], over: object = {}): AssistantChangeSummary =>
    ({
      entity: "cook",
      recipeName: "Shakshuka",
      date: "2026-11-21",
      servings: 3,
      changes,
      lineNotes: [],
      entries: [entry("2026-11-21", "eaten", false)],
      ...over,
    }) as AssistantChangeSummary;

  it("names the batch, the day it was made and what it gave beside the recipe, its entries, and the lines added, left out and changed", () => {
    const summary = cook([
      { field: "servings", from: 2, to: 3 },
      lines({
        added: [{ name: "Pinaatti", grams: 80 }],
        removed: [{ name: "Oliiviöljy", grams: 15 }],
        changed: [{ name: "Fetajuusto", grams: { from: 60, to: 100 } }],
      }),
    ]);
    expect(read(change("cook.logged", summary))).toEqual([
      "Made a batch of Shakshuka",
      "Made 21 November 2026 · gave 3 servings · the recipe makes 2",
      "Logged for 21 November 2026 · 1 serving · 241 kcal · 17.2 g protein",
      "Ingredient added: Pinaatti 80 g",
      "Ingredient left out: Oliiviöljy 15 g",
      "Fetajuusto: 60 g to 100 g",
    ]);
  });

  it("says what a batch made as written gave, and reads its entries", () => {
    expect(read(change("cook.logged", cook([], { servings: 2 })))).toEqual([
      "Made a batch of Shakshuka",
      "Made 21 November 2026 · gave 2 servings",
      "Logged for 21 November 2026 · 1 serving · 241 kcal · 17.2 g protein",
    ]);
  });

  it("reads a batch whose entries are all planned as planned, never as logged", () => {
    const entries = [entry("2026-11-22", "planned", true), entry("2026-11-23", "planned", false)];
    const rows = read(change("cook.logged", cook([], { entries })));
    expect(rows.slice(2)).toEqual([
      "Planned for 22 November 2026 · already on the day · 1 serving · 241 kcal · 17.2 g protein",
      "Planned for 23 November 2026 · 1 serving · 241 kcal · 17.2 g protein",
    ]);
    expect(rows.join(" ")).not.toMatch(/Logged/);
  });

  it("reads each entry of a mixed batch by its own status, and an attached one apart from one the batch added", () => {
    const entries = [entry("2026-11-21", "eaten", true), entry("2026-11-21", "eaten", false)];
    expect(read(change("cook.logged", cook([], { entries }))).slice(2)).toEqual([
      "Logged for 21 November 2026 · already on the day · 1 serving · 241 kcal · 17.2 g protein",
      "Logged for 21 November 2026 · 1 serving · 241 kcal · 17.2 g protein",
    ]);
    const mixed = [entry("2026-11-21", "eaten", true), entry("2026-11-22", "planned", false)];
    expect(read(change("cook.logged", cook([], { entries: mixed }))).slice(2)).toEqual([
      "Logged for 21 November 2026 · already on the day · 1 serving · 241 kcal · 17.2 g protein",
      "Planned for 22 November 2026 · 1 serving · 241 kcal · 17.2 g protein",
    ]);
  });

  it("says as made nowhere, and names the lines the batch noted apart from its changes", () => {
    const rows = read(change("cook.logged", cook([], { lineNotes: ["Fetajuusto", "Kananmuna, keitetty"] })));
    expect(rows.at(-1)).toBe("With a note for this batch: Fetajuusto · Kananmuna, keitetty");
    expect(rows.join(" ")).not.toMatch(/as made/);
  });
});

describe("save_cook_as_recipe", () => {
  it("says the recipe came from a batch, and a recipe from no batch says nothing of one", () => {
    const fromCook = { recipeName: "Shakshuka", date: "2026-11-21" };
    const saved = { ...recipe([{ field: "servings", from: null, to: 3 }]), name: "Shakshuka, spicy", fromCook };
    expect(read(change("recipe.created", saved as AssistantChangeSummary))).toEqual([
      "Created the recipe Shakshuka, spicy",
      "From a batch of Shakshuka made 21 November 2026",
      "Servings: 3",
    ]);
    expect(read(change("recipe.created", recipe([{ field: "servings", from: null, to: 3 }])))).toEqual([
      "Created the recipe Shakshuka",
      "Servings: 3",
    ]);
  });
});

describe("spokenText of a recipe change", () => {
  const spoken = (c: AssistantChange): string => {
    const w = words();
    return spokenText(changeText(c, w), "19 November 2026 at 14:32", w.t);
  };

  it("joins lines and tags with and, so a comma inside a food's name does not read as two", () => {
    const summary = recipe([
      lines({
        added: [
          { name: "Kananmuna, keitetty", grams: 240 },
          { name: "Salt, flaky", grams: null },
        ],
      }),
      { field: "tags", from: null, to: ["Brunch", "Quick"] },
    ]);
    expect(spoken(change("recipe.created", summary))).toBe(
      "Created the recipe Shakshuka. Ingredients: Kananmuna, keitetty 240 g and Salt, flaky. " +
        "Tags: Brunch and Quick. 19 November 2026 at 14:32.",
    );
  });

  it("reads a changed line under its own name, its parts joined with and, so a comma in a name stays inside it", () => {
    const summary = recipe([lines({ changed: [egg({ note: "added", grams: { from: 240, to: 300 } })] })]);
    expect(spoken(change("recipe.changed", summary))).toBe(
      "Changed the recipe Shakshuka. Kananmuna, keitetty: 240 g to 300 g and note added. 19 November 2026 at 14:32.",
    );
    const swapped = recipe([lines({ changed: [egg({ food: { from: "Leipä, ruis" }, grams: { from: 120, to: 5 } })] })]);
    expect(spoken(change("recipe.changed", swapped))).toBe(
      "Changed the recipe Shakshuka. Kananmuna, keitetty: in place of Leipä, ruis and 120 g to 5 g. " +
        "19 November 2026 at 14:32.",
    );
  });
});
