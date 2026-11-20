import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import type { AssistantChange, AssistantChangeSummary, AssistantEntryLine } from "@hovimestari/types";
import { changeText, spokenText } from "../_components/changeText";
import { change, NOW, porridge, read, words } from "./changeTextFixtures";

// ---------------------------------------------------------------------------
// One line per action an assistant's write tools record, from a summary of
// the shape the backend records for it ("Slice 4b, as built" in
// docs/design/connected-ai.md), read through the real catalog. The clock is
// pinned and the device's language is British English, so every date reads
// "21 November 2026" whatever the machine. A line is its label, then its
// parts joined by the dot the sheet draws between them.
// ---------------------------------------------------------------------------

beforeEach(() => {
  clockFrom(NOW);
  setTestLocale("en-GB");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("changeText: one line per recorded action", () => {
  it("log_food, planned, by grams", () => {
    expect(read(change("entry.added", { entity: "entry", entry: porridge, changes: [] }))).toEqual([
      "Planned Oat porridge",
      "For 21 November 2026 · 150 g · 98 kcal · 16.5 g protein",
    ]);
  });

  it("log_food, eaten, by a Fineli portion", () => {
    const entry: AssistantEntryLine = {
      ...porridge,
      name: "Egg",
      status: "eaten",
      amount: { portionLabel: "KPL_M", portionUnit: "KPL_M", count: 2, grams: 110 },
      figures: { energyKcal: 150, proteinG: 13.8, carbsG: 0.4, fatG: 10.5 },
    };
    expect(read(change("entry.added", { entity: "entry", entry, changes: [] }))).toEqual([
      "Logged Egg",
      "For 21 November 2026 · 2 × Medium piece · 110 g · 150 kcal · 13.8 g protein",
    ]);
  });

  it("log_saved_meal", () => {
    const entry: AssistantEntryLine = {
      ...porridge,
      name: "Chicken bowl",
      kind: "saved_meal",
      amount: { count: 1 },
      figures: { energyKcal: 640, proteinG: 48, carbsG: 60, fatG: 20 },
    };
    expect(read(change("entry.added", { entity: "entry", entry, changes: [] }))).toEqual([
      "Planned Chicken bowl",
      "For 21 November 2026 · 1 meal · 640 kcal · 48 g protein",
    ]);
  });

  it("log_estimate", () => {
    const entry: AssistantEntryLine = {
      ...porridge,
      name: "Lunch at the canteen",
      status: "eaten",
      kind: "estimate",
      amount: null,
      figures: { energyKcal: 700, proteinG: 35, carbsG: 80, fatG: 25 },
    };
    expect(read(change("entry.added", { entity: "entry", entry, changes: [] }))).toEqual([
      "Logged Lunch at the canteen",
      "For 21 November 2026 · Estimate · 700 kcal · 35 g protein",
    ]);
  });

  it("update_entry: one line per field, in the order recorded", () => {
    const summary: AssistantChangeSummary = {
      entity: "entry",
      entry: { ...porridge, status: "eaten", date: "2026-11-22", amount: { grams: 200 } },
      changes: [
        { field: "date", from: "2026-11-21", to: "2026-11-22" },
        { field: "status", from: "planned", to: "eaten" },
        { field: "amount", from: { grams: 150 }, to: { grams: 200 } },
        { field: "note", from: null, to: "With berries" },
      ],
    };
    expect(read(change("entry.changed", summary))).toEqual([
      "Changed the entry Oat porridge",
      "Date: 21 November 2026 to 22 November 2026",
      "Eaten: no to yes",
      "Amount: 150 g to 200 g",
      "Note: With berries",
    ]);
  });

  it("update_entry on an estimate's figures and a note taken away", () => {
    const summary: AssistantChangeSummary = {
      entity: "entry",
      entry: { ...porridge, kind: "estimate", amount: null },
      changes: [
        {
          field: "figures",
          from: { energyKcal: 700, proteinG: 35, carbsG: 80, fatG: 25 },
          to: { energyKcal: 650, proteinG: 40, carbsG: 70, fatG: 22.5 },
        },
        { field: "note", from: "Big plate", to: null },
      ],
    };
    expect(read(change("entry.changed", summary))).toEqual([
      "Changed the entry Oat porridge",
      "Figures, before: 700 kcal · 35 g protein · 80 g carbs · 25 g fat",
      "Figures, after: 650 kcal · 40 g protein · 70 g carbs · 22.5 g fat",
      "Note: Big plate to none",
    ]);
  });

  it("set_entries_status, eaten and planned, with working plurals", () => {
    const two = [porridge, { ...porridge, name: "Rahka", date: "2026-11-22" }].map((e) => ({
      ...e,
      status: "eaten" as const,
    }));
    expect(read(change("entries.marked", { entity: "entries", entries: two, toDate: null }))).toEqual([
      "Marked 2 entries eaten",
      "Oat porridge for 21 November 2026 · Rahka for 22 November 2026",
    ]);
    expect(read(change("entries.marked", { entity: "entries", entries: [porridge], toDate: null }))).toEqual([
      "Marked 1 entry planned",
      "Oat porridge for 21 November 2026",
    ]);
  });

  it("copy_entries", () => {
    const copies = [
      { ...porridge, date: "2026-11-24" },
      { ...porridge, name: "Rahka", date: "2026-11-24" },
    ];
    expect(read(change("entries.copied", { entity: "entries", entries: copies, toDate: "2026-11-24" }))).toEqual([
      "Copied 2 entries to 24 November 2026 as planned entries",
      "Oat porridge · Rahka",
    ]);
  });

  it("remove_entries", () => {
    const three = [porridge, { ...porridge, name: "Rahka" }, { ...porridge, name: "Banana", date: "2026-11-17" }];
    expect(read(change("entries.removed", { entity: "entries", entries: three, toDate: null }))).toEqual([
      "Removed 3 entries",
      "Oat porridge for 21 November 2026 · Rahka for 21 November 2026 · Banana for 17 November 2026",
    ]);
    expect(read(change("entries.removed", { entity: "entries", entries: [porridge], toDate: null }))[0]).toBe(
      "Removed 1 entry",
    );
  });

  it("restore_entry", () => {
    expect(read(change("entry.restored", { entity: "entry", entry: porridge, changes: [] }))).toEqual([
      "Put back the entry Oat porridge",
      "For 21 November 2026",
    ]);
  });

  it("create_own_food, with a barcode", () => {
    const summary: AssistantChangeSummary = {
      entity: "food",
      name: "Protein bar",
      changes: [
        { field: "per100g", from: null, to: { energyKcal: 350, proteinG: 33, carbsG: 30, fatG: 12 } },
        { field: "barcode", from: null, to: "6411401015090" },
      ],
    };
    expect(read(change("food.created", summary))).toEqual([
      "Added the food Protein bar",
      "Per 100 g: 350 kcal · 33 g protein · 30 g carbs · 12 g fat",
      "Barcode: 6411401015090",
    ]);
  });

  it("update_own_food", () => {
    const summary: AssistantChangeSummary = {
      entity: "food",
      name: "Protein bar, chocolate",
      changes: [
        { field: "name", from: "Protein bar", to: "Protein bar, chocolate" },
        {
          field: "per100g",
          from: { energyKcal: 350, proteinG: 33, carbsG: 30, fatG: 12 },
          to: { energyKcal: 360, proteinG: 33, carbsG: 31, fatG: 12.5 },
        },
      ],
    };
    expect(read(change("food.changed", summary))).toEqual([
      "Changed the food Protein bar, chocolate",
      "Name: Protein bar to Protein bar, chocolate",
      "Per 100 g, before: 350 kcal · 33 g protein · 30 g carbs · 12 g fat",
      "Per 100 g, after: 360 kcal · 33 g protein · 31 g carbs · 12.5 g fat",
    ]);
  });

  it("add_portion", () => {
    const summary: AssistantChangeSummary = {
      entity: "food",
      name: "Protein bar",
      changes: [
        { field: "name", from: null, to: "bar" },
        { field: "grams", from: null, to: 60 },
      ],
    };
    expect(read(change("portion.added", summary))).toEqual(["Added a portion to Protein bar", "bar · 60 g"]);
  });

  it("update_portion, naming the portion when only its grams changed", () => {
    const summary: AssistantChangeSummary = {
      entity: "food",
      name: "Protein bar",
      portion: "bar",
      changes: [{ field: "grams", from: 60, to: 55 }],
    };
    expect(read(change("portion.changed", summary))).toEqual([
      "Changed a portion of Protein bar",
      "Portion: bar",
      "Grams: 60 g to 55 g",
    ]);
  });

  it("update_portion, where the change of name already says which portion", () => {
    const summary: AssistantChangeSummary = {
      entity: "food",
      name: "Protein bar",
      portion: "big bar",
      changes: [{ field: "name", from: "bar", to: "big bar" }],
    };
    expect(read(change("portion.changed", summary))).toEqual([
      "Changed a portion of Protein bar",
      "Name: bar to big bar",
    ]);
  });

  it("update_portion recorded before the record held the portion's name", () => {
    const summary: AssistantChangeSummary = {
      entity: "food",
      name: "Protein bar",
      changes: [{ field: "grams", from: 60, to: 55 }],
    };
    expect(read(change("portion.changed", summary))).toEqual([
      "Changed a portion of Protein bar",
      "Grams: 60 g to 55 g",
    ]);
  });

  it("set_favourite, on and off", () => {
    const summary: AssistantChangeSummary = { entity: "food", name: "Rahka", changes: [] };
    expect(read(change("favourite.set", summary))).toEqual(["Marked Rahka as a favourite"]);
    expect(read(change("favourite.unset", summary))).toEqual(["Took Rahka off the favourites"]);
  });

  it("create_saved_meal", () => {
    const summary: AssistantChangeSummary = {
      entity: "saved_meal",
      name: "Chicken bowl",
      changes: [
        { field: "source", from: null, to: "Foodora" },
        { field: "figures", from: null, to: { energyKcal: 640, proteinG: 48, carbsG: 60, fatG: 20 } },
      ],
    };
    expect(read(change("saved_meal.created", summary))).toEqual([
      "Saved the meal Chicken bowl",
      "Source: Foodora",
      "Figures: 640 kcal · 48 g protein · 60 g carbs · 20 g fat",
    ]);
  });

  it("update_saved_meal", () => {
    const summary: AssistantChangeSummary = {
      entity: "saved_meal",
      name: "Chicken bowl",
      changes: [{ field: "source", from: "Foodora", to: null }],
    };
    expect(read(change("saved_meal.changed", summary))).toEqual([
      "Changed the meal Chicken bowl",
      "Source: Foodora to none",
    ]);
  });

  it("set_saved_meal_archived, archived and back", () => {
    const summary: AssistantChangeSummary = { entity: "saved_meal", name: "Chicken bowl", changes: [] };
    expect(read(change("saved_meal.archived", summary))).toEqual(["Archived the meal Chicken bowl"]);
    expect(read(change("saved_meal.restored", summary))).toEqual(["Put the meal Chicken bowl back from the archive"]);
  });

  it("set_recipe_archived and set_recipe_favourite, each way", () => {
    const summary: AssistantChangeSummary = { entity: "recipe", name: "Shakshuka", changes: [] };
    expect(read(change("recipe.archived", summary))).toEqual(["Archived the recipe Shakshuka"]);
    expect(read(change("recipe.restored", summary))).toEqual(["Put the recipe Shakshuka back from the archive"]);
    expect(read(change("recipe.favourite_set", summary))).toEqual(["Marked the recipe Shakshuka as a favourite"]);
    expect(read(change("recipe.favourite_unset", summary))).toEqual(["Took the recipe Shakshuka off the favourites"]);
  });

  it("set_targets, new and replacing a change on the same date", () => {
    const after = { energyKcal: { lower: 2000, upper: 2400 }, proteinG: { lower: 140, upper: 180 } };
    const before = { energyKcal: { lower: 1900, upper: 2300 }, proteinG: { lower: 130, upper: 170 } };
    expect(
      read(change("targets.set", { entity: "targets", effectiveFrom: "2026-12-01", before: null, after })),
    ).toEqual(["Set targets from 1 December 2026", "Calories 2000 to 2400 kcal · Protein 140 to 180 g"]);
    expect(read(change("targets.set", { entity: "targets", effectiveFrom: "2026-12-01", before, after }))).toEqual([
      "Set targets from 1 December 2026",
      "Calories 2000 to 2400 kcal · Protein 140 to 180 g",
      "Replaced: Calories 1900 to 2300 kcal · Protein 130 to 170 g",
    ]);
  });

  it("remove_targets", () => {
    const before = { energyKcal: { lower: 1900, upper: 2300 }, proteinG: { lower: 130.5, upper: 170 } };
    expect(
      read(change("targets.removed", { entity: "targets", effectiveFrom: "2026-12-01", before, after: null })),
    ).toEqual(["Removed the targets from 1 December 2026", "Calories 1900 to 2300 kcal · Protein 130.5 to 170 g"]);
  });
});

describe("changeText: names are data, dates and figures are the device's", () => {
  it("puts a name in its own slot only, with whatever it holds", () => {
    const name = "{count} <b>bold</b> 'quoted' # Rahka";
    expect(read(change("favourite.set", { entity: "food", name, changes: [] }))).toEqual([
      `Marked ${name} as a favourite`,
    ]);
  });

  it("renders dates and decimals for a Finnish device, with English words", () => {
    setTestLocale("fi-FI");
    expect(read(change("entry.added", { entity: "entry", entry: porridge, changes: [] }))).toEqual([
      "Planned Oat porridge",
      "For 21. marraskuuta 2026 · 150 g · 98 kcal · 16,5 g protein",
    ]);
  });

  it("renders dates for an American device", () => {
    setTestLocale("en-US");
    expect(read(change("entry.restored", { entity: "entry", entry: porridge, changes: [] }))).toEqual([
      "Put back the entry Oat porridge",
      "For November 21, 2026",
    ]);
  });

  it("never groups digits, so a figure reads as it would be typed", () => {
    const after = { energyKcal: { lower: 2400, upper: 2800 }, proteinG: { lower: 180, upper: 200 } };
    const [, line] = read(
      change("targets.set", { entity: "targets", effectiveFrom: "2026-12-01", before: null, after }),
    );
    expect(line).toBe("Calories 2400 to 2800 kcal · Protein 180 to 200 g");
  });
});

describe("spokenText: one sentence for a screen reader", () => {
  const spoken = (c: AssistantChange): string => {
    const w = words();
    return spokenText(changeText(c, w), "19 November 2026 at 14:32", w.t);
  };

  it("keeps a name's own full stop rather than reading two", () => {
    const entry = { ...porridge, name: "Rahka." };
    expect(spoken(change("entry.added", { entity: "entry", entry, changes: [] }))).toBe(
      "Planned Rahka. For 21 November 2026, 150 g, 98 kcal, 16.5 g protein. 19 November 2026 at 14:32.",
    );
  });

  it("joins copied names with and, so a comma inside a name does not read as two entries", () => {
    const entries = [
      { ...porridge, name: "Protein bar, chocolate" },
      { ...porridge, name: "Oat porridge" },
      { ...porridge, name: "Rahka" },
    ];
    expect(spoken(change("entries.copied", { entity: "entries", entries, toDate: "2026-11-21" }))).toBe(
      "Copied 3 entries to 21 November 2026 as planned entries. " +
        "Protein bar, chocolate and Oat porridge and Rahka. 19 November 2026 at 14:32.",
    );
  });
});
