import type { SavedMeal } from "@hovimestari/types";
import { and, asc, desc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { entries, savedMeals } from "../../db/schema/index.js";
import type { Db } from "../../db/types.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { byName } from "../foodRows.js";
import type { ReadContext } from "./context.js";

type MealRow = typeof savedMeals.$inferSelect;

/** A stored meal as the API shows it. */
export const savedMealOf = (row: MealRow, lastCount: number | null): SavedMeal => ({
  id: row.id,
  name: row.name,
  source: row.source,
  figures: { energyKcal: row.energyKcal, proteinG: row.proteinG, carbsG: row.carbsG, fatG: row.fatG },
  archived: row.archivedAt !== null,
  lastCount,
});

/** The meals of `userId` a user can see: their own, not deleted. */
export const ownMeal = (userId: string): SQL => and(eq(savedMeals.userId, userId), isNull(savedMeals.deletedAt))!;

/** The count of the user's latest eaten entry of each meal in `mealIds`. */
export async function lastCountsOf(db: Db, userId: string, mealIds: string[]): Promise<Map<string, number>> {
  if (mealIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([entries.savedMealId], { mealId: entries.savedMealId, count: entries.mealCount })
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.savedMealId, mealIds), isNotNull(entries.eatenAt)))
    .orderBy(entries.savedMealId, desc(entries.eatenAt), desc(entries.position));
  return new Map(rows.map((r) => [r.mealId!, r.count!]));
}

/** The user's saved meals, active or archived, in Finnish alphabetical order. Deleted ones never. */
export async function listSavedMeals(ctx: ReadContext, { archived }: { archived: boolean }): Promise<SavedMeal[]> {
  const rows = await ctx.db
    .select()
    .from(savedMeals)
    .where(and(ownMeal(ctx.userId), archived ? isNotNull(savedMeals.archivedAt) : isNull(savedMeals.archivedAt)))
    .orderBy(byName(savedMeals.name), asc(savedMeals.id));
  const counts = await lastCountsOf(
    ctx.db,
    ctx.userId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => savedMealOf(r, counts.get(r.id) ?? null));
}

/** One of the user's saved meals, archived or not. Unknown, deleted or another user's: 404 `saved_meal_not_found`. */
export async function getSavedMeal(ctx: ReadContext, id: string): Promise<SavedMeal> {
  if (!isUuid(id)) throw appError("saved_meal_not_found", 404);
  const [row] = await ctx.db
    .select()
    .from(savedMeals)
    .where(and(eq(savedMeals.id, id), ownMeal(ctx.userId)));
  if (!row) throw appError("saved_meal_not_found", 404);
  const counts = await lastCountsOf(ctx.db, ctx.userId, [id]);
  return savedMealOf(row, counts.get(id) ?? null);
}
