import { FINELI_PORTION_UNITS, type FoodDetail, type FoodList, type Portion } from "@hovimestari/types";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { foodFavourites, foodPortions, foods } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { displayName, portionOf, summaryColumns, summaryOf } from "../foodRows.js";
import { portionVisibleTo, visibleFood, visibleTo } from "../foodScope.js";
import { searchQuery, searchWords } from "../foodSearch.js";
import type { ReadContext } from "./context.js";

/**
 * Foods whose names hold every word of `q`, ranked by the search rule. A
 * query with no word of two characters or more answers no foods.
 */
export async function searchFoods(ctx: ReadContext, { q, limit }: { q: string; limit: number }): Promise<FoodList> {
  const words = await searchWords(ctx.db, q);
  if (words.length === 0) return { foods: [] };
  const rows = await searchQuery(ctx.db, ctx.userId, words, limit);
  return { foods: rows.map(summaryOf) };
}

/** The user's favourite foods, newest favourite first, at most `limit`. Retired foods stay. */
export async function listFavouriteFoods(ctx: ReadContext, { limit }: { limit: number }): Promise<FoodList> {
  const rows = await ctx.db
    .select(summaryColumns(ctx.userId))
    .from(foods)
    .innerJoin(foodFavourites, and(eq(foodFavourites.foodId, foods.id), eq(foodFavourites.userId, ctx.userId)))
    .where(visibleTo(ctx.userId))
    .orderBy(desc(foodFavourites.createdAt), asc(foods.id))
    .limit(limit);
  return { foods: rows.map(summaryOf) };
}

/** The user's own foods, by name, at most `limit`. */
export async function listOwnFoods(ctx: ReadContext, { limit }: { limit: number }): Promise<FoodList> {
  const rows = await ctx.db
    .select(summaryColumns(ctx.userId))
    .from(foods)
    .where(and(eq(foods.source, "user"), eq(foods.userId, ctx.userId)))
    .orderBy(displayName(ctx.userId), asc(foods.id))
    .limit(limit);
  return { foods: rows.map(summaryOf) };
}

/**
 * The portions of food `foodId` the user may see: Fineli's in the fixed unit
 * order, then the user's by name. None when the user cannot see the food.
 */
export async function portionsOf(ctx: ReadContext, foodId: string): Promise<Portion[]> {
  const units = sql.join(
    FINELI_PORTION_UNITS.map((u) => sql`${u}`),
    sql`, `,
  );
  const unitOrder = sql`array_position(ARRAY[${units}]::text[], ${foodPortions.fineliUnit})`;
  const rows = await ctx.db
    .select({ portion: foodPortions })
    .from(foodPortions)
    .innerJoin(foods, eq(foods.id, foodPortions.foodId))
    .where(and(visibleFood(ctx.userId, foodId), portionVisibleTo(ctx.userId)))
    .orderBy(sql`${unitOrder} NULLS LAST`, asc(foodPortions.name), asc(foodPortions.id));
  return rows.map((r) => portionOf(r.portion, ctx.userId));
}

/**
 * One food with its portions. An unknown id, a malformed one and another
 * user's own food all answer 404 `food_not_found`, so a response never tells
 * that a food exists. A retired food is still readable.
 */
export async function getFood(ctx: ReadContext, id: string): Promise<FoodDetail> {
  if (!isUuid(id)) throw appError("food_not_found", 404);
  const [row] = await ctx.db
    .select({
      ...summaryColumns(ctx.userId),
      barcode: foods.barcode,
      fineliId: foods.fineliId,
      fineliType: foods.fineliType,
      fineliProcess: foods.fineliProcess,
    })
    .from(foods)
    .where(visibleFood(ctx.userId, id));
  if (!row) throw appError("food_not_found", 404);
  return {
    ...summaryOf(row),
    barcode: row.barcode,
    fineli:
      row.fineliId === null ? null : { id: row.fineliId, type: row.fineliType ?? "", process: row.fineliProcess ?? "" },
    portions: await portionsOf(ctx, id),
  };
}
