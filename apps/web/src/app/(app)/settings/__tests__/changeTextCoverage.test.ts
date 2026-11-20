import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { ASSISTANT_CHANGE_ACTIONS, type AssistantChangeSummary, type AssistantEntryLine } from "@hovimestari/types";
import { changeText, spokenText } from "../_components/changeText";
import { change, EVERY_ACTION, NOW, porridge, read, words } from "./changeTextFixtures";

// ---------------------------------------------------------------------------
// The record's words as a whole: every action the record names has its own
// line, a screen reader hears each change as one sentence of the same words,
// and a portion is named the way the Day tab names it. Clock and language
// pinned, as in changeText.test.ts.
// ---------------------------------------------------------------------------

beforeEach(() => {
  clockFrom(NOW);
  setTestLocale("en-GB");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("changeText: every action the record names", () => {
  it("has a fixture and its own headline for each action, distinct from every other action's", () => {
    const headlines = new Map<string, string>();
    for (const action of ASSISTANT_CHANGE_ACTIONS) {
      const fixture = EVERY_ACTION[action] as (typeof EVERY_ACTION)[typeof action] | undefined;
      expect({ action, fixture: typeof fixture }).toEqual({ action, fixture: "function" });
      const { headline } = changeText(fixture!(), words());
      expect({ action, headline }).toEqual({ action, headline: expect.stringMatching(/\S/) });
      expect({ action, headline }).not.toEqual({ action, headline: "Made a change" });
      const taken = [...headlines].find(([, h]) => h === headline);
      expect({ action, sameAs: taken?.[0] }).toEqual({ action, sameAs: undefined });
      headlines.set(action, headline);
    }
    expect(headlines.size).toBe(ASSISTANT_CHANGE_ACTIONS.length);
  });

  it("reads a summary that is not of the kind its action records as a change, and claims nothing more", () => {
    const summary: AssistantChangeSummary = { entity: "food", name: "Rahka", changes: [] };
    expect(read(change("entry.added", summary))).toEqual(["Made a change"]);
    expect(read(change("targets.set", summary))).toEqual(["Made a change"]);
  });
});

describe("spokenText: one sentence per change, from the same words", () => {
  const when = "19 November 2026 at 14:32";
  const spoken = (c: ReturnType<typeof change>): string => spokenText(changeText(c, words()), when, words().t);

  it("says what happened, its details with their units in a list, then when", () => {
    expect(spoken(change("entry.added", { entity: "entry", entry: porridge, changes: [] }))).toBe(
      "Planned Oat porridge. For 21 November 2026, 150 g, 98 kcal, 16.5 g protein. 19 November 2026 at 14:32.",
    );
  });

  it("says before and after as two labelled parts", () => {
    const summary: AssistantChangeSummary = {
      entity: "saved_meal",
      name: "Chicken bowl",
      changes: [
        {
          field: "figures",
          from: { energyKcal: 700, proteinG: 35, carbsG: 80, fatG: 25 },
          to: { energyKcal: 650, proteinG: 40, carbsG: 70, fatG: 22.5 },
        },
      ],
    };
    expect(spoken(change("saved_meal.changed", summary))).toBe(
      "Changed the meal Chicken bowl. " +
        "Figures, before: 700 kcal, 35 g protein, 80 g carbs, 25 g fat. " +
        "Figures, after: 650 kcal, 40 g protein, 70 g carbs, 22.5 g fat. " +
        "19 November 2026 at 14:32.",
    );
  });

  it("says a change with no details as the headline and when", () => {
    expect(spoken(change("favourite.set", { entity: "food", name: "Rahka", changes: [] }))).toBe(
      "Marked Rahka as a favourite. 19 November 2026 at 14:32.",
    );
  });
});

describe("changeText: a portion is named as the Day tab names it", () => {
  const logged = (amount: AssistantEntryLine["amount"]): string =>
    read(change("entry.added", { entity: "entry", entry: { ...porridge, amount }, changes: [] }))[1]!;

  it("names a Fineli portion by its unit, before any name the label holds", () => {
    expect(logged({ portionLabel: "Big one", portionUnit: "KPL_M", count: 2, grams: 110 })).toBe(
      "For 21 November 2026 · 2 × Medium piece · 110 g · 98 kcal · 16.5 g protein",
    );
  });

  it("names a portion of the person's own by its name, even a name that reads like a unit's code", () => {
    expect(logged({ portionLabel: "KPL_M", portionUnit: null, count: 1, grams: 60 })).toBe(
      "For 21 November 2026 · 1 × KPL_M · 60 g · 98 kcal · 16.5 g protein",
    );
  });

  it("shows the grams alone for a unit it has no name for, never the code", () => {
    const amount = { portionLabel: "KPL_XXL", portionUnit: "KPL_XXL", count: 2, grams: 300 };
    expect(logged(amount as unknown as AssistantEntryLine["amount"])).toBe(
      "For 21 November 2026 · 300 g · 98 kcal · 16.5 g protein",
    );
  });

  it("shows the grams alone for a portion with no name", () => {
    expect(logged({ portionLabel: "", portionUnit: null, count: 2, grams: 110 })).toBe(
      "For 21 November 2026 · 110 g · 98 kcal · 16.5 g protein",
    );
  });

  it("reads a row recorded before the unit was kept apart: a known code as its unit, else the label", () => {
    expect(logged({ portionLabel: "KPL_M", count: 2, grams: 110 })).toBe(
      "For 21 November 2026 · 2 × Medium piece · 110 g · 98 kcal · 16.5 g protein",
    );
    expect(logged({ portionLabel: "bar", count: 1, grams: 60 })).toBe(
      "For 21 November 2026 · 1 × bar · 60 g · 98 kcal · 16.5 g protein",
    );
  });
});
