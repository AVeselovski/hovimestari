import {
  entryFigures,
  positionOf,
  totalOf,
  type Day,
  type Entry,
  type Figures,
  type TargetRanges,
} from "@hovimestari/types";

// Days and entries as the API answers them, built with the shared figure
// functions the server runs, so a fixture's totals and positions are the
// server's own.

let ids = 0;
/** A UUID that differs per call and reads as one. */
export function entryId(): string {
  ids += 1;
  return `00000000-0000-4000-9000-${String(ids).padStart(12, "0")}`;
}

export const TODAY = "2026-11-16";
export const RANGES = { energyKcal: { lower: 1900, upper: 2200 }, proteinG: { lower: 140, upper: 180 } };

/** Quark: 59.31 kcal and 12.44 g protein per 100 g. */
export const QUARK = { energyKcal: 59.31, proteinG: 12.44, carbsG: 3.6, fatG: 0.2 };

/** A food entry of `grams`, typed in grams. */
export function foodEntry(name: string, grams: number, overrides: Partial<Entry> = {}): Entry {
  const basis = overrides.basis ?? QUARK;
  return {
    id: entryId(),
    date: TODAY,
    position: ids,
    status: "eaten",
    kind: "food",
    name,
    food: { id: entryId(), source: "fineli", retired: false, deleted: false },
    savedMeal: null,
    grams,
    portion: null,
    count: null,
    note: null,
    basis,
    figures: entryFigures(basis, { per: "100g", grams }),
    isEstimate: false,
    ...overrides,
  };
}

/** A food entry typed as `count` of a portion of `portionGrams`. */
export function portionEntry(
  name: string,
  count: number,
  portionGrams: number,
  portion: { id: string | null; name?: string },
  overrides: Partial<Entry> = {},
): Entry {
  const grams = Math.round(count * portionGrams * 10) / 10;
  return foodEntry(name, grams, {
    portion: { id: portion.id, unit: null, name: portion.name ?? "Glass", count },
    ...overrides,
  });
}

/** A saved meal entry of `count` meals. */
export function mealEntry(name: string, count: number, basis: Figures, overrides: Partial<Entry> = {}): Entry {
  return {
    ...foodEntry(name, 1),
    kind: "saved_meal",
    food: null,
    savedMeal: { id: entryId(), source: "Delivered", archived: false, deleted: false },
    grams: null,
    count,
    basis,
    figures: entryFigures(basis, { per: "meal", count }),
    ...overrides,
  };
}

/** An estimate with its typed figures. */
export function estimateEntry(name: string, figures: Figures, overrides: Partial<Entry> = {}): Entry {
  return {
    ...foodEntry(name, 1),
    kind: "estimate",
    food: null,
    grams: null,
    basis: figures,
    figures,
    isEstimate: true,
    note: null,
    ...overrides,
  };
}

/**
 * A day of `entries` on `date`, its readings and positions computed as the
 * server computes them. `targets` null is a day without targets: no ranges
 * and no position in either reading, the figures as always.
 */
export function dayOf(entries: Entry[], date = TODAY, today = TODAY, targets: TargetRanges | null = RANGES): Day {
  const eaten = entries.filter((e) => e.status === "eaten");
  const reading = (rows: Entry[]) => {
    const figures = totalOf(rows.map((r) => r.figures));
    return {
      figures,
      energy: targets ? positionOf(figures.energyKcal, targets.energyKcal) : null,
      protein: targets ? positionOf(figures.proteinG, targets.proteinG) : null,
      includesEstimate: rows.some((r) => r.isEstimate),
    };
  };
  const relation = date < today ? "past" : date > today ? "future" : "today";
  const planned = entries.filter((e) => e.status === "planned").length;
  return {
    date,
    today,
    relation,
    targets,
    eaten: reading(eaten),
    withPlan: reading(entries),
    entryCount: entries.length,
    plannedCount: planned,
    unmarkedCount: relation === "past" ? planned : 0,
    entries: entries.map((e) => ({ ...e, date })),
  };
}
