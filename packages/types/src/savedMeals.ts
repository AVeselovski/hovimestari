import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { ENTRY_STATUSES, EntryCountSchema, NameSchema, TypedFiguresSchema } from "./entries.js";
import { FiguresSchema } from "./figures.js";

/** The longest source tag, in characters. */
export const MAX_MEAL_SOURCE_LENGTH = 40;

/** Where a meal comes from, such as a delivery service: one free-text tag, trimmed. Blank is none. */
const SourceSchema = z
  .string({ error: "invalid_request" })
  .trim()
  .max(MAX_MEAL_SOURCE_LENGTH, { error: "meal_source_too_long" })
  .transform((s) => s || null);

const mealFields = {
  name: NameSchema,
  source: SourceSchema.nullable().default(null),
  /** Total figures for one meal, as read from a label or a menu. */
  figures: TypedFiguresSchema,
};

/** `POST /saved-meals`. The client chooses the id, so a repeated create applies once. */
export const SavedMealBodySchema = z.object({ id: z.uuid(), ...mealFields });
/** `PUT /saved-meals/:id`. */
export const SavedMealEditBodySchema = z.object(mealFields);

export const SavedMealSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  source: z.string().nullable(),
  /** Per meal. */
  figures: FiguresSchema,
  archived: z.boolean(),
  /** The count of the user's latest eaten entry of this meal, or null. */
  lastCount: z.number().nullable(),
});

export const SavedMealListSchema = z.object({ meals: z.array(SavedMealSchema) });

/** The query of `GET /saved-meals`: the active meals, or with `archived=true` the archived ones. */
export const SavedMealsQuerySchema = z.object({
  archived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** `POST /saved-meals/log`: create a meal and log it in one request. */
export const SaveAndLogBodySchema = z.object({
  meal: SavedMealBodySchema,
  entry: z.object({ id: z.uuid(), date: IsoDateSchema, status: z.enum(ENTRY_STATUSES), count: EntryCountSchema }),
});

export type SavedMealBody = z.infer<typeof SavedMealBodySchema>;
export type SavedMealEditBody = z.infer<typeof SavedMealEditBodySchema>;
export type SavedMeal = z.infer<typeof SavedMealSchema>;
export type SavedMealList = z.infer<typeof SavedMealListSchema>;
export type SavedMealsQuery = z.infer<typeof SavedMealsQuerySchema>;
export type SaveAndLogBody = z.infer<typeof SaveAndLogBodySchema>;
