import {
  MAX_FIGURE_G,
  MAX_FIGURE_KCAL,
  recipeBasis,
  type ErrorCode,
  type Figures,
  type FoodSource,
  type IngredientLineDraft,
} from "@hovimestari/types";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { foods } from "../db/schema/index.js";
import type { Db } from "../db/types.js";
import { AppError } from "../lib/errors.js";
import { displayName } from "./foodRows.js";
import { visibleTo } from "./foodScope.js";
import type { ReadContext } from "./reads/context.js";
import { gramsOf, type StoredAmount } from "./sourceValues.js";

// ---------------------------------------------------------------------------
// The one line check a recipe preview and a recipe save share, so a preview
// that passes is a save that passes, and the one place a recipe's basis is
// computed from its lines.
//
// A save holds the user's own foods among its lines FOR SHARE, in one
// statement in food id order, right after the recipe's row lock, then reads
// every food's values in a second statement. An own food's edit or delete
// then waits for the save, or the save waits for it and reads the food as it
// is, so neither misses the other's line. Fineli foods and kept products are
// never locked: they are never deleted, and their changes rewrite no entry.
// ---------------------------------------------------------------------------

/** A line's food as the app reads it for a recipe. */
export interface LineFood {
  id: string;
  /** In the user's food-name language. */
  name: string;
  source: FoodSource;
  per100g: Figures;
  retired: boolean;
  deleted: boolean;
}

/**
 * Every distinct food of `foodIds` a line may point at: one the user can
 * see, or one already on this recipe (`knownFoodIds`), read without the
 * visibility rule so an old line keeps a food hidden or retired since. With
 * `lock`, the user's own foods among them are first taken FOR SHARE. A food
 * missing from the answer is refused at its line.
 */
export async function readLineFoods(
  db: Db,
  ctx: ReadContext,
  foodIds: readonly string[],
  knownFoodIds: readonly string[],
  { lock }: { lock: boolean },
): Promise<Map<string, LineFood>> {
  const ids = [...new Set(foodIds.map((id) => id.toLowerCase()))];
  if (ids.length === 0) return new Map();
  if (lock) {
    await db
      .select({ id: foods.id })
      .from(foods)
      .where(and(inArray(foods.id, ids), eq(foods.userId, ctx.userId)))
      .orderBy(asc(foods.id))
      .for("share");
  }
  const rows = await db
    .select({
      id: foods.id,
      name: displayName(ctx.userId),
      source: foods.source,
      energyKcal: foods.energyKcal,
      proteinG: foods.proteinG,
      carbsG: foods.carbsG,
      fatG: foods.fatG,
      retired: sql<boolean>`${foods.retiredAt} IS NOT NULL`,
      deleted: sql<boolean>`${foods.deletedAt} IS NOT NULL`,
      visible: sql<boolean>`coalesce(${visibleTo(ctx.userId)}, false)`,
    })
    .from(foods)
    .where(inArray(foods.id, ids));
  const known = new Set(knownFoodIds.map((id) => id.toLowerCase()));
  const found = new Map<string, LineFood>();
  for (const row of rows) {
    if (!row.visible && !known.has(row.id)) continue;
    found.set(row.id, {
      id: row.id,
      name: row.name,
      source: row.source,
      per100g: { energyKcal: row.energyKcal, proteinG: row.proteinG, carbsG: row.carbsG, fatG: row.fatG },
      retired: row.retired,
      deleted: row.deleted,
    });
  }
  return found;
}

/** A counted line once checked: its food and its amount as the app stores it. */
export interface CheckedLine {
  food: LineFood;
  amount: StoredAmount;
}

/** The refusals a line can meet, and their statuses. */
const LINE_STATUS: Partial<Record<ErrorCode, number>> = {
  food_not_found: 404,
  portion_not_found: 404,
  entry_grams_invalid: 400,
};

/** A line's check: what a counted line stores, nothing for a line not counted, or why it is refused. */
export type LineCheck =
  { refusal: null; checked: CheckedLine | null } | { refusal: ErrorCode; status: number; checked: null };

/**
 * One line of a draft checked against `foods`, read by `readLineFoods`: the
 * food is there, and a count of a portion is of the food's own portion,
 * visible to the user, and comes to a weight a line can hold.
 */
export async function checkLine(
  db: Db,
  ctx: ReadContext,
  line: IngredientLineDraft,
  lineFoods: Map<string, LineFood>,
): Promise<LineCheck> {
  if (!line.counted) return { refusal: null, checked: null };
  const food = lineFoods.get(line.foodId.toLowerCase());
  if (!food) return { refusal: "food_not_found", status: 404, checked: null };
  try {
    return { refusal: null, checked: { food, amount: await gramsOf(db, ctx, food.id, line.amount) } };
  } catch (err) {
    const status = err instanceof AppError && err.code ? LINE_STATUS[err.code] : undefined;
    if (status === undefined) throw err;
    return { refusal: (err as AppError).code!, status, checked: null };
  }
}

/** A line as a basis reads it: its food's values and its grams. A line not counted has no food. */
export interface BasisLine {
  food: { per100g: Figures } | null;
  grams: number | null;
}

/** A checked line as a basis reads it. */
export const basisLine = (line: CheckedLine | null): BasisLine =>
  line === null ? { food: null, grams: null } : { food: line.food, grams: line.amount.grams };

/**
 * One serving's basis from a recipe's lines and its servings. Lines not
 * counted add nothing. Not capped: a read shows what a stored recipe comes
 * to, even when an own food edited since takes a serving past the cap.
 */
export function servingBasis(lines: readonly BasisLine[], servings: number): Figures {
  const counted = lines.flatMap((l) => (l.food === null ? [] : [{ per100g: l.food.per100g, grams: l.grams! }]));
  return recipeBasis(counted, servings);
}

/**
 * One serving's basis, or null when one serving comes to more than an entry
 * can hold: 10000 kcal, or 1000 g of a macro, the caps a typed figure has.
 * What a save, a preview and an entry of a recipe accept.
 */
export function cappedServingBasis(lines: readonly BasisLine[], servings: number): Figures | null {
  const basis = servingBasis(lines, servings);
  const fits =
    basis.energyKcal <= MAX_FIGURE_KCAL &&
    basis.proteinG <= MAX_FIGURE_G &&
    basis.carbsG <= MAX_FIGURE_G &&
    basis.fatG <= MAX_FIGURE_G;
  return fits ? basis : null;
}
