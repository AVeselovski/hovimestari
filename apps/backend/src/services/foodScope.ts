import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { foodLookups, foodPortions, foods } from "../db/schema/index.js";

// The only place the visibility rules are written. Every food query and every
// portion query passes through them.

/**
 * The foods `userId` may see: every Fineli food, their own, and each Open
 * Food Facts food they have looked up. Never another user's own food, never
 * an Open Food Facts food only someone else looked up, and never one its
 * owner deleted while days use it.
 *
 * The Open Food Facts branch rests on one invariant: a `food_lookups` row
 * goes only with its user or its food, by the two cascades. A user can log
 * or star an Open Food Facts food only once it is visible, so every such
 * food in their favourites or recents has their row. No code may delete a
 * `food_lookups` row, or those favourites and recents would vanish from the
 * user's reads. Entries do not depend on it: `selectEntries` reads an
 * entry's food with no visibility filter.
 */
export const visibleTo = (userId: string): SQL =>
  and(
    isNull(foods.deletedAt),
    or(
      eq(foods.source, "fineli"),
      eq(foods.userId, userId),
      and(
        eq(foods.source, "open_food_facts"),
        sql`EXISTS (SELECT 1 FROM ${foodLookups} WHERE ${foodLookups.userId} = ${userId} AND ${foodLookups.foodId} = ${foods.id})`,
      ),
    ),
  )!;

/** The portions `userId` may see: those that come with the food's source, and their own. */
export const portionVisibleTo = (userId: string): SQL =>
  or(isNull(foodPortions.userId), eq(foodPortions.userId, userId))!;

/** A visible food with `id`. */
export const visibleFood = (userId: string, id: string): SQL => and(eq(foods.id, id), visibleTo(userId))!;
