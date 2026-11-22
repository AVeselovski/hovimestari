import { parseDecimalInput } from "@/lib/decimalInput";
import { formatDecimalForField } from "@/lib/foodFormat";
import type { RecipeFilter, RecipeSort } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The Recipes tab's sort and figure filter: what is in force on the list, and
// the draft the filter sheet holds while it is open. The list filters and
// sorts with the shared `filterRecipes` and `sortRecipes`, so this file only
// carries the choice and reads what is typed. It computes no figure.
// ---------------------------------------------------------------------------

/** The four bounds, in the order the sheet shows them: protein, then calories, each at least, then at most. */
export const BOUND_KEYS = ["minProteinG", "maxProteinG", "minEnergyKcal", "maxEnergyKcal"] as const;

/** The bounds on a serving's figures a recipe list is narrowed by, as the shared filter names them. A bound left out is not set. */
export type FigureBounds = Partial<Pick<RecipeFilter, (typeof BOUND_KEYS)[number]>>;

/** The order and the bounds in force on the recipe list. */
export interface ListFilter {
  sort: RecipeSort;
  bounds: FigureBounds;
}

export type BoundKey = keyof FigureBounds;

/** A list by name with no bound: what the tab opens on. */
export const NO_FILTER: ListFilter = { sort: "name", bounds: {} };

/** How many bounds are set. */
export function boundCount(bounds: FigureBounds): number {
  return BOUND_KEYS.filter((key) => bounds[key] !== undefined).length;
}

/** What the Filter chip counts: each bound set, and a sort other than by name. */
export function filterCount(filter: ListFilter): number {
  return boundCount(filter.bounds) + (filter.sort === "name" ? 0 : 1);
}

/** The filter sheet's fields: the sort, and each bound as typed. */
export type FilterDraft = { sort: RecipeSort } & Record<BoundKey, string>;

/** Why a typed bound is refused: not a number, or a number that may hold a thousands group. */
export type BoundError = "invalid" | "group";

export function draftOf(filter: ListFilter): FilterDraft {
  const typed = (key: BoundKey): string => {
    const value = filter.bounds[key];
    return value === undefined ? "" : formatDecimalForField(value, "en");
  };
  return {
    sort: filter.sort,
    minProteinG: typed("minProteinG"),
    maxProteinG: typed("maxProteinG"),
    minEnergyKcal: typed("minEnergyKcal"),
    maxEnergyKcal: typed("maxEnergyKcal"),
  };
}

/** A draft with nothing set: by name, every bound empty. */
export const EMPTY_DRAFT: FilterDraft = draftOf(NO_FILTER);

/**
 * The filter a draft comes to, or the bounds it cannot read. An empty bound
 * is not set. A bound is a number from 0 up with one decimal at most, the
 * precision a serving's figures are shown and compared at.
 */
export function readDraft(
  draft: FilterDraft,
): { ok: true; filter: ListFilter } | { ok: false; errors: Partial<Record<BoundKey, BoundError>> } {
  const bounds: FigureBounds = {};
  const errors: Partial<Record<BoundKey, BoundError>> = {};
  for (const key of BOUND_KEYS) {
    const parsed = parseDecimalInput(draft[key], { maxDecimals: 1 });
    if (parsed.kind === "number") bounds[key] = parsed.value;
    else if (parsed.kind !== "empty") errors[key] = parsed.kind;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, filter: { sort: draft.sort, bounds } };
}
