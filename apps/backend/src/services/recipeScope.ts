import { and, eq, isNull, type SQL } from "drizzle-orm";
import { recipes } from "../db/schema/index.js";

// The only place a recipe's visibility rule is written. Every read and write
// of a recipe the person can see, list or edit passes through it.

/** The recipes of `userId` a user can see: their own, not deleted. */
export const ownRecipe = (userId: string): SQL => and(eq(recipes.userId, userId), isNull(recipes.deletedAt))!;
