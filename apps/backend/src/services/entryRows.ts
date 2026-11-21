import {
  entryFigures,
  type Entry,
  type Figures,
  type FineliPortionUnit,
  type FoodSource,
  type Scale,
} from "@hovimestari/types";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { cooks, entries, foodPortions, foods, recipes, savedMeals } from "../db/schema/index.js";
import type { Db } from "../db/types.js";
import { cookDiffersOf } from "./cookRows.js";
import { displayName } from "./foodRows.js";
import { portionVisibleTo } from "./foodScope.js";

// The one selection every entry read answers with. It joins the entry's food,
// saved meal and recipe WITHOUT the visibility rule: an entry is scoped by its own
// user_id, and a hidden or retired source keeps its rows on every day. The
// portion is joined only through the hint rule: same id, same food as the
// entry, and visible to the user. Any other portion_id reads as null. A
// cook's entry joins its cook's row. Whether the cook differs from its
// recipe takes one more query per read, for all its cooks (`entriesOf`).

/** The columns `entryOf` reads, for `db.select(...)`. */
export const entryColumns = (userId: string) => ({
  entry: entries,
  foodName: displayName(userId),
  foodSource: foods.source,
  foodRetired: sql<boolean>`${foods.retiredAt} IS NOT NULL`,
  foodDeleted: sql<boolean>`${foods.deletedAt} IS NOT NULL`,
  mealName: savedMeals.name,
  mealSource: savedMeals.source,
  mealArchived: sql<boolean>`${savedMeals.archivedAt} IS NOT NULL`,
  mealDeleted: sql<boolean>`${savedMeals.deletedAt} IS NOT NULL`,
  recipeName: recipes.name,
  recipeArchived: sql<boolean>`${recipes.archivedAt} IS NOT NULL`,
  recipeDeleted: sql<boolean>`${recipes.deletedAt} IS NOT NULL`,
  cookDate: cooks.date,
  cookServings: cooks.servings,
  portionId: foodPortions.id,
});

type EntryRow = {
  entry: typeof entries.$inferSelect;
  foodName: string | null;
  foodSource: FoodSource | null;
  foodRetired: boolean | null;
  foodDeleted: boolean | null;
  mealName: string | null;
  mealSource: string | null;
  mealArchived: boolean | null;
  mealDeleted: boolean | null;
  recipeName: string | null;
  recipeArchived: boolean | null;
  recipeDeleted: boolean | null;
  cookDate: string | null;
  cookServings: number | null;
  portionId: string | null;
};

/** The entries of `userId` matching `where`, in day order: position, then id. */
export function selectEntries(db: Db, userId: string, where: SQL | undefined) {
  return db
    .select(entryColumns(userId))
    .from(entries)
    .leftJoin(foods, eq(foods.id, entries.foodId))
    .leftJoin(savedMeals, eq(savedMeals.id, entries.savedMealId))
    .leftJoin(recipes, eq(recipes.id, entries.recipeId))
    .leftJoin(cooks, eq(cooks.id, entries.cookId))
    .leftJoin(
      foodPortions,
      and(eq(foodPortions.id, entries.portionId), eq(foodPortions.foodId, entries.foodId), portionVisibleTo(userId)),
    )
    .where(and(eq(entries.userId, userId), where))
    .orderBy(asc(entries.date), asc(entries.position), asc(entries.id));
}

/** An entry's stored basis. */
export const basisOf = (e: typeof entries.$inferSelect): Figures => ({
  energyKcal: e.basisEnergyKcal,
  proteinG: e.basisProteinG,
  carbsG: e.basisCarbsG,
  fatG: e.basisFatG,
});

/** `figures` as an entry's basis columns, for an insert or an update. */
export const basisColumnsOf = (figures: Figures) => ({
  basisEnergyKcal: figures.energyKcal,
  basisProteinG: figures.proteinG,
  basisCarbsG: figures.carbsG,
  basisFatG: figures.fatG,
});

/** What an entry's basis is per, and how much of it there is. */
export function scaleOf(e: typeof entries.$inferSelect): Scale {
  switch (e.kind) {
    case "food":
      return { per: "100g", grams: e.grams! };
    case "saved_meal":
      return { per: "meal", count: e.mealCount! };
    case "recipe":
      return { per: "serving", count: e.servings! };
    case "estimate":
      return { per: "whole" };
  }
}

/** An entry's name: its food's in the user's language, its meal's or recipe's as it is now, or its own. */
function nameOf(row: EntryRow): string {
  switch (row.entry.kind) {
    case "food":
      return row.foodName ?? "";
    case "saved_meal":
      return row.mealName ?? "";
    case "recipe":
      return row.recipeName ?? "";
    case "estimate":
      return row.entry.name ?? "";
  }
}

/**
 * No cook differs. Only for a read that answers no entry, such as a week's
 * summaries: a read that answers entries runs `cookDiffersOf` instead.
 */
export const NO_COOKS: ReadonlyMap<string, boolean> = new Map();

/**
 * A selected row as the API shows it. The figures come from the row's basis
 * and amount alone. `differs` says, per cook, whether it differs from its
 * recipe now (`cookDiffersOf`).
 */
export function entryOf(row: EntryRow, differs: ReadonlyMap<string, boolean>): Entry {
  const e = row.entry;
  return {
    id: e.id,
    date: e.date,
    position: e.position,
    status: e.status,
    kind: e.kind,
    name: nameOf(row),
    food:
      e.foodId === null
        ? null
        : { id: e.foodId, source: row.foodSource!, retired: row.foodRetired!, deleted: row.foodDeleted! },
    savedMeal:
      e.savedMealId === null
        ? null
        : { id: e.savedMealId, source: row.mealSource, archived: row.mealArchived!, deleted: row.mealDeleted! },
    grams: e.grams,
    portion:
      e.portionCount === null
        ? null
        : {
            id: row.portionId,
            unit: e.portionUnit as FineliPortionUnit | null,
            name: e.portionName,
            count: e.portionCount,
          },
    count: e.mealCount,
    servings: e.servings,
    recipe: e.recipeId === null ? null : { id: e.recipeId, archived: row.recipeArchived!, deleted: row.recipeDeleted! },
    cook:
      e.cookId === null
        ? null
        : { id: e.cookId, date: row.cookDate!, servings: row.cookServings!, differs: differs.get(e.cookId) ?? false },
    note: e.note,
    basis: basisOf(e),
    figures: entryFigures(basisOf(e), scaleOf(e)),
    isEstimate: e.kind === "estimate",
  };
}

/** Selected rows as the API shows them, with one query for whether their cooks differ, and none without a cook. */
export async function entriesOf(db: Db, userId: string, rows: EntryRow[]): Promise<Entry[]> {
  const cookIds = [...new Set(rows.flatMap((r) => (r.entry.cookId === null ? [] : [r.entry.cookId])))];
  const differs = cookIds.length === 0 ? NO_COOKS : await cookDiffersOf(db, userId, cookIds);
  return rows.map((row) => entryOf(row, differs));
}
