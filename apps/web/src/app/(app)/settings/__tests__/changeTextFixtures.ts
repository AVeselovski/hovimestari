import type {
  AssistantChange,
  AssistantChangeAction,
  AssistantChangeSummary,
  AssistantEntryLine,
} from "@hovimestari/types";
import { renderHook } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { changeText, type ChangeText, type ChangeWords } from "../_components/changeText";

// ---------------------------------------------------------------------------
// What the changeText suites share: the real catalog's words, a change of
// any action, and a summary of the shape the backend records for each
// action ("Slice 4b, as built" in docs/design/connected-ai.md).
// ---------------------------------------------------------------------------

export const NOW = "2026-11-19T10:00:00.000Z";

export function words(): ChangeWords {
  return renderHook(() => ({
    t: useTranslations("settings.connectedAi.activitySheet"),
    units: useTranslations("foods.portionUnits"),
  })).result.current;
}

let n = 0;
export function change(action: AssistantChange["action"], summary: AssistantChangeSummary): AssistantChange {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    action,
    at: "2026-11-19T12:32:00.000Z",
    connectionName: "Claude on my laptop",
    summary,
    deletionStatus: null,
  };
}

export const porridge: AssistantEntryLine = {
  name: "Oat porridge",
  date: "2026-11-21",
  status: "planned",
  kind: "food",
  amount: { grams: 150 },
  figures: { energyKcal: 98, proteinG: 16.5, carbsG: 4, fatG: 0.3 },
};

/** A line as the sheet shows it: its label and a colon, then its parts with a dot between them. */
export function shown(text: ChangeText): string[] {
  return [text.headline, ...text.lines.map((l) => (l.label === null ? "" : `${l.label}: `) + l.parts.join(" · "))];
}

/** What the sheet shows for a change. */
export function read(c: AssistantChange): string[] {
  return shown(changeText(c, words()));
}

const figures = { energyKcal: 640, proteinG: 48, carbsG: 60, fatG: 20 };
const ranges = { energyKcal: { lower: 2000, upper: 2400 }, proteinG: { lower: 140, upper: 180 } };

/**
 * One change of every action the record names. A `Record` over the actions,
 * so an action added to the record fails the type check here until it has a
 * fixture, and the suite that runs them all fails until it has a line.
 */
export const EVERY_ACTION: Record<AssistantChangeAction, () => AssistantChange> = {
  "entry.added": () => change("entry.added", { entity: "entry", entry: porridge, changes: [] }),
  "entry.changed": () =>
    change("entry.changed", {
      entity: "entry",
      entry: porridge,
      changes: [{ field: "amount", from: { grams: 150 }, to: { grams: 200 } }],
    }),
  "entries.marked": () => change("entries.marked", { entity: "entries", entries: [porridge], toDate: null }),
  "entries.copied": () => change("entries.copied", { entity: "entries", entries: [porridge], toDate: "2026-11-24" }),
  "entries.removed": () => change("entries.removed", { entity: "entries", entries: [porridge], toDate: null }),
  "entry.restored": () => change("entry.restored", { entity: "entry", entry: porridge, changes: [] }),
  "food.created": () =>
    change("food.created", {
      entity: "food",
      name: "Protein bar",
      changes: [{ field: "per100g", from: null, to: figures }],
    }),
  "food.changed": () =>
    change("food.changed", {
      entity: "food",
      name: "Protein bar",
      changes: [{ field: "barcode", from: null, to: "6411401015090" }],
    }),
  "portion.added": () =>
    change("portion.added", {
      entity: "food",
      name: "Protein bar",
      changes: [
        { field: "name", from: null, to: "bar" },
        { field: "grams", from: null, to: 60 },
      ],
    }),
  "portion.changed": () =>
    change("portion.changed", {
      entity: "food",
      name: "Protein bar",
      portion: "bar",
      changes: [{ field: "grams", from: 60, to: 55 }],
    }),
  "favourite.set": () => change("favourite.set", { entity: "food", name: "Rahka", changes: [] }),
  "favourite.unset": () => change("favourite.unset", { entity: "food", name: "Rahka", changes: [] }),
  "saved_meal.created": () =>
    change("saved_meal.created", {
      entity: "saved_meal",
      name: "Chicken bowl",
      changes: [{ field: "figures", from: null, to: figures }],
    }),
  "saved_meal.changed": () =>
    change("saved_meal.changed", {
      entity: "saved_meal",
      name: "Chicken bowl",
      changes: [{ field: "source", from: "Foodora", to: null }],
    }),
  "saved_meal.archived": () =>
    change("saved_meal.archived", { entity: "saved_meal", name: "Chicken bowl", changes: [] }),
  "saved_meal.restored": () =>
    change("saved_meal.restored", { entity: "saved_meal", name: "Chicken bowl", changes: [] }),
  "recipe.created": () =>
    change("recipe.created", {
      entity: "recipe",
      name: "Shakshuka",
      changes: [{ field: "servings", from: null, to: 2 }],
    }),
  "recipe.changed": () =>
    change("recipe.changed", {
      entity: "recipe",
      name: "Shakshuka",
      changes: [{ field: "servings", from: 2, to: 3 }],
    }),
  "recipe.archived": () => change("recipe.archived", { entity: "recipe", name: "Shakshuka", changes: [] }),
  "recipe.restored": () => change("recipe.restored", { entity: "recipe", name: "Shakshuka", changes: [] }),
  "recipe.favourite_set": () => change("recipe.favourite_set", { entity: "recipe", name: "Shakshuka", changes: [] }),
  "recipe.favourite_unset": () =>
    change("recipe.favourite_unset", { entity: "recipe", name: "Shakshuka", changes: [] }),
  "cook.logged": () =>
    change("cook.logged", {
      entity: "cook",
      recipeName: "Shakshuka",
      date: "2026-11-21",
      servings: 3,
      changes: [{ field: "servings", from: 2, to: 3 }],
      lineNotes: [],
      entries: [
        { ...porridge, name: "Shakshuka", kind: "recipe", amount: { servings: 1, asMade: true }, attached: true },
      ],
    }),
  "targets.set": () =>
    change("targets.set", { entity: "targets", effectiveFrom: "2026-12-01", before: null, after: ranges }),
  "targets.removed": () =>
    change("targets.removed", { entity: "targets", effectiveFrom: "2026-12-01", before: ranges, after: null }),
  "deletion.requested": () =>
    change("deletion.requested", {
      entity: "deletion",
      requestId: "00000000-0000-4000-8000-0000000000ff",
      kind: "own_food",
      name: "Protein bar",
    }),
};
