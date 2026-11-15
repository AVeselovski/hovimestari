import { and, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { foodPortions, foods } from "../db/schema/index.js";

// The only place the visibility rules are written. Every food query and every
// portion query passes through them.

/** The foods `userId` may see: every shared food, and their own. Never another user's own food. */
export const visibleTo = (userId: string): SQL => or(ne(foods.source, "user"), eq(foods.userId, userId))!;

/** The portions `userId` may see: those that come with the food's source, and their own. */
export const portionVisibleTo = (userId: string): SQL =>
  or(isNull(foodPortions.userId), eq(foodPortions.userId, userId))!;

/** A visible food with `id`. */
export const visibleFood = (userId: string, id: string): SQL => and(eq(foods.id, id), visibleTo(userId))!;
