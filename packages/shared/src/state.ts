import { z } from "zod";

export const AisleCategorySchema = z.enum([
  "produce",
  "bakery",
  "meat-fish",
  "dairy",
  "frozen",
  "pantry",
  "drinks",
  "other",
]);
export type AisleCategory = z.infer<typeof AisleCategorySchema>;

export const AISLE_CATEGORIES = AisleCategorySchema.options;

export const IngredientSchema = z.object({
  name: z.string(),
  amount: z.string(),
  unit: z.string(),
  category: AisleCategorySchema,
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  time: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  category: z.enum(["common", "special"]),
  keepsOvernight: z.boolean().optional(),
  ingredients: z.array(IngredientSchema),
  instructions: z.array(z.string().min(1).max(1000)).default([]),
  lastUsed: z.string().optional(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipeDraftSchema = RecipeSchema.omit({ id: true, lastUsed: true });
export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

export const StapleGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  order: z.number().int(),
});
export type StapleGroup = z.infer<typeof StapleGroupSchema>;

export const StapleSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  name: z.string(),
  amount: z.string(),
  unit: z.string(),
  category: AisleCategorySchema,
  enabled: z.boolean(),
});
export type Staple = z.infer<typeof StapleSchema>;

export const PlanSchema = z.object({
  selectedRecipeIds: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

export const StateSchema = z.object({
  recipes: z.array(RecipeSchema),
  stapleGroups: z.array(StapleGroupSchema),
  staples: z.array(StapleSchema),
  plan: PlanSchema,
});
export type State = z.infer<typeof StateSchema>;

export const EMPTY_STATE: State = {
  recipes: [],
  stapleGroups: [],
  staples: [],
  plan: { selectedRecipeIds: [] },
};
