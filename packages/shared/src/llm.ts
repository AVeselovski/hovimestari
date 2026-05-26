import { z } from "zod";
import { RecipeDraftSchema } from "./state.js";

export const RecipeImportRequestSchema = z.object({
  text: z.string().min(1).max(20000),
});
export type RecipeImportRequest = z.infer<typeof RecipeImportRequestSchema>;

export const RecipeImportResponseSchema = z.object({
  draft: RecipeDraftSchema,
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  provider: z.string(),
});
export type RecipeImportResponse = z.infer<typeof RecipeImportResponseSchema>;
