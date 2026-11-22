import { z } from "zod";
import { FoodSummarySchema, LastAmountSchema } from "./foods.js";
import { RecipeSummarySchema } from "./recipes.js";
import { SavedMealSchema } from "./savedMeals.js";

/** How many recent items `GET /log/recents` answers by default, and at most. */
export const DEFAULT_RECENTS_LIMIT = 12;
export const MAX_RECENTS_LIMIT = 30;

/** A food, saved meal or recipe the user ate recently, with the amount of the latest time. */
export const RecentItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food"), food: FoodSummarySchema, last: LastAmountSchema }),
  z.object({ kind: z.literal("saved_meal"), meal: SavedMealSchema, last: z.object({ count: z.number() }) }),
  z.object({ kind: z.literal("recipe"), recipe: RecipeSummarySchema, last: z.object({ servings: z.number() }) }),
]);

export const RecentListSchema = z.object({ items: z.array(RecentItemSchema) });

export const RecentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_RECENTS_LIMIT).default(DEFAULT_RECENTS_LIMIT),
});

export type RecentItem = z.infer<typeof RecentItemSchema>;
export type RecentList = z.infer<typeof RecentListSchema>;
export type RecentsQuery = z.infer<typeof RecentsQuerySchema>;
