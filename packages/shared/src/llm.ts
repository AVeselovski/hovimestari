import { z } from "zod";
import { RecipeDraftSchema } from "./state.js";

export const RecipeImportRequestSchema = z.object({
  text: z.string().min(1).max(20000),
});
export type RecipeImportRequest = z.infer<typeof RecipeImportRequestSchema>;

export const SUPPORTED_IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const SupportedImageMediaTypeSchema = z.enum(SUPPORTED_IMAGE_MEDIA_TYPES);
export type SupportedImageMediaType = z.infer<
  typeof SupportedImageMediaTypeSchema
>;

export const RecipeImageImportRequestSchema = z.object({
  image: z.object({
    data: z.string().min(1),
    mediaType: SupportedImageMediaTypeSchema,
  }),
  notes: z.string().trim().min(1).max(500).optional(),
});
export type RecipeImageImportRequest = z.infer<
  typeof RecipeImageImportRequestSchema
>;

export const ImageUploadRequestSchema = z.object({
  image: z.object({
    data: z.string().min(1),
    mediaType: SupportedImageMediaTypeSchema,
  }),
});
export type ImageUploadRequest = z.infer<typeof ImageUploadRequestSchema>;

export const ImageUploadResponseSchema = z.object({
  imageId: z.string(),
});
export type ImageUploadResponse = z.infer<typeof ImageUploadResponseSchema>;

export const RecipeImportResponseSchema = z.object({
  draft: RecipeDraftSchema,
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  provider: z.string(),
  model: z.string(),
  fallback: z
    .object({
      provider: z.string(),
      model: z.string(),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
});
export type RecipeImportResponse = z.infer<typeof RecipeImportResponseSchema>;
