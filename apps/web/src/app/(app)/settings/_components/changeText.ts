import { portionName, type PortionUnitNames } from "@/components/entries/portionLabel";
import { formatCount } from "@/lib/entryFormat";
import { formatGrams, formatKcal } from "@/lib/foodFormat";
import { formatDay } from "@/lib/localDate";
import { formatTarget } from "@/lib/targetFormat";
import {
  FINELI_PORTION_UNITS,
  type AssistantChange,
  type AssistantChangeSummary,
  type AssistantEntryLine,
  type AssistantFieldChange,
  type TargetRanges,
} from "@hovimestari/types";
import type { useTranslations } from "next-intl";
import { recipeChangeLines } from "./recipeChangeText";

// ---------------------------------------------------------------------------
// One change in a connection's record, as the Activity sheet reads it: a
// headline that says what was changed, then the lines under it. A line is an
// optional label and its parts. The sheet shows the parts with a dot between
// them and keeps each part whole, so a figure never parts from its unit.
//
// Words come from the catalog, dates and figures from the app's formatters,
// in the device's language. Names are data: each goes into its own slot and
// nowhere else. Nothing here judges a change or computes a figure. Every
// figure is one the change's answer held.
//
// `changeText` switches on the action, and every action has its case, so an
// action added to the record is a type error here until it has its words.
// `spokenText` reads the same words as one sentence for a screen reader.
// ---------------------------------------------------------------------------

type T = ReturnType<typeof useTranslations<"settings.connectedAi.activitySheet">>;

/** The words for a change: the sheet's own, and the names of Fineli's portion units. */
export interface ChangeWords {
  t: T;
  units: PortionUnitNames;
}

/** One line under a headline: what it is about, when it says, then its parts. */
export interface ChangeLine {
  label: string | null;
  parts: string[];
  /** The parts are names alone, which may hold commas, so a screen reader hears "and" between them. */
  names?: true;
}

/** What one change reads as: its headline, then its lines. */
export interface ChangeText {
  headline: string;
  lines: ChangeLine[];
}

type Figures = { energyKcal: number; proteinG: number; carbsG: number; fatG: number };
type Field = AssistantFieldChange["field"];
type Summary<E extends AssistantChangeSummary["entity"]> = Extract<AssistantChangeSummary, { entity: E }>;

const UNITS: ReadonlySet<string> = new Set(FINELI_PORTION_UNITS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFigures(value: unknown): value is Figures {
  return (
    isRecord(value) &&
    typeof value.energyKcal === "number" &&
    typeof value.proteinG === "number" &&
    typeof value.carbsG === "number" &&
    typeof value.fatG === "number"
  );
}

const line = (parts: string[], label: string | null = null): ChangeLine => ({ label, parts });

/** The summary when it is of the entity the action records, else null. */
function of<E extends AssistantChangeSummary["entity"]>(summary: AssistantChangeSummary, entity: E): Summary<E> | null {
  return summary.entity === entity ? (summary as Summary<E>) : null;
}

/**
 * The name of a portion amount's portion. A row that keeps the Fineli unit
 * apart names it by the unit, as the Day tab does. An older row kept one
 * label, its own name else the unit's code, so a label that is a known code
 * reads as that unit.
 */
function amountPortionName(amount: Record<string, unknown>, units: PortionUnitNames): string | null {
  const label = typeof amount.portionLabel === "string" ? amount.portionLabel : "";
  if (amount.portionUnit !== undefined) {
    const unit = typeof amount.portionUnit === "string" ? amount.portionUnit : null;
    return portionName({ unit, name: unit === null ? label : null }, units);
  }
  return portionName(UNITS.has(label) ? { unit: label, name: null } : { unit: null, name: label }, units);
}

/**
 * An entry's amount: "150 g", "2 × Medium piece" and "110 g", or "1 meal".
 * A portion with no name this app can give reads as its grams alone.
 */
function amountParts(amount: unknown, { t, units }: ChangeWords): string[] | null {
  if (!isRecord(amount)) return null;
  if (typeof amount.grams === "number") {
    const grams = t("part.grams", { value: formatGrams(amount.grams) });
    if (typeof amount.count !== "number" || !("portionLabel" in amount)) return [grams];
    const portion = amountPortionName(amount, units);
    return portion === null ? [grams] : [t("part.portion", { count: formatCount(amount.count), portion }), grams];
  }
  if (typeof amount.count === "number") return [t("part.meals", { count: amount.count })];
  return null;
}

function figuresParts(figures: Figures, t: T): string[] {
  return [
    t("part.kcal", { value: formatKcal(figures.energyKcal) }),
    t("part.protein", { value: formatGrams(figures.proteinG) }),
    t("part.carbs", { value: formatGrams(figures.carbsG) }),
    t("part.fat", { value: formatGrams(figures.fatG) }),
  ];
}

function rangesParts(ranges: TargetRanges, t: T): string[] {
  return [
    t("part.calories", { lower: formatTarget(ranges.energyKcal.lower), upper: formatTarget(ranges.energyKcal.upper) }),
    t("part.proteinRange", { lower: formatTarget(ranges.proteinG.lower), upper: formatTarget(ranges.proteinG.upper) }),
  ];
}

/** One side of a field's change, as its parts. A value missing, empty or of an unknown form reads as "none". */
function valueParts(field: Field, value: unknown, words: ChangeWords): string[] {
  const { t } = words;
  const none = [t("part.none")];
  switch (field) {
    case "date":
      return typeof value === "string" ? [formatDay(value)] : none;
    case "status":
      return value === "eaten" ? [t("part.yes")] : value === "planned" ? [t("part.no")] : none;
    case "amount":
      return amountParts(value, words) ?? none;
    case "figures":
    case "per100g":
      return isFigures(value) ? figuresParts(value, t) : none;
    case "grams":
      return typeof value === "number" ? [t("part.grams", { value: formatGrams(value) })] : none;
    case "name":
    case "note":
    case "barcode":
    case "source":
      return typeof value === "string" && value.trim() !== "" ? [value] : none;
  }
}

/**
 * A field's change. A value of one part reads on one line, "Amount: 150 g to
 * 200 g". Values of several parts, such as figures, read before and after on
 * a line each, so the change is not lost in the middle of a long line. A
 * field set where there was none reads as its new value alone.
 */
function changeLines(change: AssistantFieldChange, words: ChangeWords): ChangeLine[] {
  const { t } = words;
  const field = t(`field.${change.field}`);
  const to = valueParts(change.field, change.to, words);
  if (change.from === null || change.from === undefined) return [line(to, field)];
  const from = valueParts(change.field, change.from, words);
  if (from.length === 1 && to.length === 1) return [line([t("part.fromTo", { from: from[0]!, to: to[0]! })], field)];
  return [line(from, t("label.before", { field })), line(to, t("label.after", { field }))];
}

const fieldLines = (changes: AssistantFieldChange[], words: ChangeWords): ChangeLine[] =>
  changes.flatMap((c) => changeLines(c, words));

/** The line of an added entry: the day it is for, its amount, its energy and its protein. */
function entryLine(entry: AssistantEntryLine, words: ChangeWords): ChangeLine {
  const { t } = words;
  const amount = entry.kind === "estimate" ? [t("part.estimate")] : (amountParts(entry.amount, words) ?? []);
  return line([
    t("part.forDay", { date: formatDay(entry.date) }),
    ...amount,
    t("part.kcal", { value: formatKcal(entry.figures.energyKcal) }),
    t("part.protein", { value: formatGrams(entry.figures.proteinG) }),
  ]);
}

/** Entries by name and the day each is for. */
const entriesFor = (entries: AssistantEntryLine[], t: T): ChangeLine[] =>
  entries.length === 0 ? [] : [line(entries.map((e) => t("part.entryFor", { name: e.name, date: formatDay(e.date) })))];

/** A change whose summary is not of the kind its action records. The record never holds one. */
const unreadable = (t: T): ChangeText => ({ headline: t("headline.unreadable"), lines: [] });

/** What one recorded change reads as, for every action an assistant can make. */
export function changeText(change: AssistantChange, words: ChangeWords): ChangeText {
  const { t } = words;
  const { summary } = change;

  switch (change.action) {
    case "entry.added": {
      const s = of(summary, "entry");
      if (!s) return unreadable(t);
      const name = s.entry.name;
      const headline =
        s.entry.status === "eaten" ? t("headline.entryLogged", { name }) : t("headline.entryPlanned", { name });
      return { headline, lines: [entryLine(s.entry, words)] };
    }
    case "entry.changed": {
      const s = of(summary, "entry");
      if (!s) return unreadable(t);
      return { headline: t("headline.entryChanged", { name: s.entry.name }), lines: fieldLines(s.changes, words) };
    }
    case "entry.restored": {
      const s = of(summary, "entry");
      if (!s) return unreadable(t);
      return {
        headline: t("headline.entryRestored", { name: s.entry.name }),
        lines: [line([t("part.forDay", { date: formatDay(s.entry.date) })])],
      };
    }
    case "entries.marked": {
      const s = of(summary, "entries");
      if (!s) return unreadable(t);
      const count = s.entries.length;
      const eaten = s.entries.every((e) => e.status === "eaten");
      return {
        headline: eaten ? t("headline.entriesMarkedEaten", { count }) : t("headline.entriesMarkedPlanned", { count }),
        lines: entriesFor(s.entries, t),
      };
    }
    case "entries.copied": {
      const s = of(summary, "entries");
      if (!s) return unreadable(t);
      const count = s.entries.length;
      const date = s.toDate ?? s.entries[0]?.date;
      return {
        headline: t("headline.entriesCopied", { count, date: date ? formatDay(date) : t("part.none") }),
        lines: count > 0 ? [{ ...line(s.entries.map((e) => e.name)), names: true }] : [],
      };
    }
    case "entries.removed": {
      const s = of(summary, "entries");
      if (!s) return unreadable(t);
      return { headline: t("headline.entriesRemoved", { count: s.entries.length }), lines: entriesFor(s.entries, t) };
    }
    case "food.created": {
      const s = of(summary, "food");
      if (!s) return unreadable(t);
      return { headline: t("headline.foodCreated", { name: s.name }), lines: fieldLines(s.changes, words) };
    }
    case "food.changed": {
      const s = of(summary, "food");
      if (!s) return unreadable(t);
      return { headline: t("headline.foodChanged", { name: s.name }), lines: fieldLines(s.changes, words) };
    }
    case "portion.added": {
      const s = of(summary, "food");
      if (!s) return unreadable(t);
      const label = s.changes.find((c) => c.field === "name")?.to;
      const grams = s.changes.find((c) => c.field === "grams")?.to;
      const parts = [
        ...(typeof label === "string" && label.trim() !== "" ? [label] : []),
        ...(typeof grams === "number" ? [t("part.grams", { value: formatGrams(grams) })] : []),
      ];
      return { headline: t("headline.portionAdded", { name: s.name }), lines: parts.length > 0 ? [line(parts)] : [] };
    }
    case "portion.changed": {
      const s = of(summary, "food");
      if (!s) return unreadable(t);
      // Which portion, when the change does not already name it. Older rows do not hold it.
      const named = s.changes.some((c) => c.field === "name");
      const which =
        s.portion !== undefined && s.portion.trim() !== "" && !named ? [line([s.portion], t("label.portion"))] : [];
      return {
        headline: t("headline.portionChanged", { name: s.name }),
        lines: [...which, ...fieldLines(s.changes, words)],
      };
    }
    case "favourite.set": {
      const s = of(summary, "food");
      return s ? { headline: t("headline.favouriteSet", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "favourite.unset": {
      const s = of(summary, "food");
      return s ? { headline: t("headline.favouriteUnset", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "saved_meal.created": {
      const s = of(summary, "saved_meal");
      if (!s) return unreadable(t);
      return { headline: t("headline.mealCreated", { name: s.name }), lines: fieldLines(s.changes, words) };
    }
    case "saved_meal.changed": {
      const s = of(summary, "saved_meal");
      if (!s) return unreadable(t);
      return { headline: t("headline.mealChanged", { name: s.name }), lines: fieldLines(s.changes, words) };
    }
    case "saved_meal.archived": {
      const s = of(summary, "saved_meal");
      return s ? { headline: t("headline.mealArchived", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "saved_meal.restored": {
      const s = of(summary, "saved_meal");
      return s ? { headline: t("headline.mealRestored", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "recipe.created": {
      const s = of(summary, "recipe");
      if (!s) return unreadable(t);
      return {
        headline: t("headline.recipeCreated", { name: s.name }),
        lines: recipeChangeLines(s.changes, words, true),
      };
    }
    case "recipe.changed": {
      const s = of(summary, "recipe");
      if (!s) return unreadable(t);
      return {
        headline: t("headline.recipeChanged", { name: s.name }),
        lines: recipeChangeLines(s.changes, words, false),
      };
    }
    case "recipe.archived": {
      const s = of(summary, "recipe");
      return s ? { headline: t("headline.recipeArchived", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "recipe.restored": {
      const s = of(summary, "recipe");
      return s ? { headline: t("headline.recipeRestored", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "recipe.favourite_set": {
      const s = of(summary, "recipe");
      return s ? { headline: t("headline.recipeFavouriteSet", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "recipe.favourite_unset": {
      const s = of(summary, "recipe");
      return s ? { headline: t("headline.recipeFavouriteUnset", { name: s.name }), lines: [] } : unreadable(t);
    }
    case "targets.set": {
      const s = of(summary, "targets");
      if (!s || s.after === null) return unreadable(t);
      const lines = [line(rangesParts(s.after, t))];
      if (s.before) lines.push(line(rangesParts(s.before, t), t("label.replaced")));
      return { headline: t("headline.targetsSet", { date: formatDay(s.effectiveFrom) }), lines };
    }
    case "targets.removed": {
      const s = of(summary, "targets");
      if (!s) return unreadable(t);
      return {
        headline: t("headline.targetsRemoved", { date: formatDay(s.effectiveFrom) }),
        lines: s.before ? [line(rangesParts(s.before, t))] : [],
      };
    }
    case "deletion.requested": {
      const s = of(summary, "deletion");
      return s ? { headline: t("headline.deletionRequested", { name: s.name }), lines: [] } : unreadable(t);
    }
    default: {
      // Every action has its case above: a new one is a type error here.
      const unhandled: never = change.action;
      return unhandled;
    }
  }
}

/** A sentence that already ends as one, such as a headline whose name ends in a full stop. */
const ENDED = /[.!?\u2026]$/u;

/**
 * A change as one sentence for a screen reader, from the same words the
 * sheet shows: what happened, then each line with its parts in a list, then
 * when. "Planned Oat porridge. For 21 November 2026, 150 g, 98 kcal, 16.5 g
 * protein. 19 November 2026 at 14:32." Names alone are joined by "and",
 * since a name may hold a comma. A sentence that already ends keeps its own
 * stop, so "Rahka." is not read with two.
 */
export function spokenText(text: ChangeText, when: string, t: T): string {
  const list = (l: ChangeLine): string =>
    l.parts.reduce((before, after) =>
      l.names ? t("spoken.names", { before, after }) : t("spoken.list", { before, after }),
    );
  const lines = text.lines
    .filter((l) => l.parts.length > 0)
    .map((l) => (l.label === null ? list(l) : t("spoken.labelled", { label: l.label, text: list(l) })));
  return [text.headline, ...lines, when]
    .map((s) => (ENDED.test(s) ? s : t("spoken.sentence", { text: s })))
    .reduce((before, after) => t("spoken.next", { before, after }));
}
