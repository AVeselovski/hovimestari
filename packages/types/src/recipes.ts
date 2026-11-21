import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { EntrySchema, FoodAmountSchema, NameSchema } from "./entries.js";
import { ERROR_CODES } from "./errors.js";
import { FiguresSchema } from "./figures.js";
import { FOOD_SOURCES } from "./foods.js";
import { hasAtMostDecimals } from "./numbers.js";

/**
 * The units a recipe's own words for an amount may use, as written beside
 * the grams: "2 cloves", "1 can". The web renders each through the catalog.
 */
export const INGREDIENT_UNITS = [
  "g",
  "kg",
  "ml",
  "dl",
  "l",
  "tsp",
  "tbsp",
  "piece",
  "clove",
  "slice",
  "can",
  "pack",
  "jar",
  "bunch",
  "pinch",
  "handful",
] as const;

/** The units counted in whole things, which a grocery list rounds up. */
export const COUNTABLE_UNITS = ["piece", "clove", "slice", "can", "pack", "jar", "bunch"] as const;

/** The most lines a recipe holds. */
export const MAX_RECIPE_LINES = 60;
/** The most tags a recipe holds. */
export const MAX_RECIPE_TAGS = 10;
/** The most steps a recipe holds. */
export const MAX_RECIPE_STEPS = 40;
/** The longest step, in characters. */
export const MAX_STEP_LENGTH = 1000;
/** The longest notes, in characters. */
export const MAX_RECIPE_NOTES_LENGTH = 2000;
/** The longest tag, in characters. */
export const MAX_TAG_LENGTH = 30;
/** The longest name of a line not counted, in characters. */
export const MAX_LINE_NAME_LENGTH = 80;
/** The longest note on a line, in characters. */
export const MAX_LINE_NOTE_LENGTH = 80;
/** The most servings a recipe makes. */
export const MAX_RECIPE_SERVINGS = 100;
/** The longest cooking time, in minutes. */
export const MAX_RECIPE_MINUTES = 1440;
/** The largest written amount, with two decimals. */
export const MAX_WRITTEN_AMOUNT = 99999.99;

/** How many servings a recipe makes: a whole number from 1 to 100. */
export const RecipeServingsSchema = z
  .number({ error: "recipe_servings_invalid" })
  .int({ error: "recipe_servings_invalid" })
  .min(1, { error: "recipe_servings_invalid" })
  .max(MAX_RECIPE_SERVINGS, { error: "recipe_servings_invalid" });

/** The cooking time in minutes, a whole number from 1 to 1440. */
const RecipeMinutesSchema = z
  .number({ error: "recipe_time_invalid" })
  .int({ error: "recipe_time_invalid" })
  .min(1, { error: "recipe_time_invalid" })
  .max(MAX_RECIPE_MINUTES, { error: "recipe_time_invalid" });

/** One step of the method, trimmed. */
const StepSchema = z
  .string({ error: "invalid_request" })
  .trim()
  .min(1, { error: "invalid_request" })
  .max(MAX_STEP_LENGTH, { error: "step_too_long" });

/** The recipe's notes, trimmed. Blank is none. */
const RecipeNotesSchema = z
  .string({ error: "invalid_request" })
  .trim()
  .max(MAX_RECIPE_NOTES_LENGTH, { error: "notes_too_long" })
  .transform((s) => s || null);

/** One of the person's own tags, trimmed, as typed. */
export const TagSchema = z
  .string({ error: "tag_invalid" })
  .trim()
  .min(1, { error: "tag_invalid" })
  .max(MAX_TAG_LENGTH, { error: "tag_invalid" });

/** The name of a line not counted, such as "Salt", trimmed. */
const LineNameSchema = z
  .string({ error: "line_name_required" })
  .trim()
  .min(1, { error: "line_name_required" })
  .max(MAX_LINE_NAME_LENGTH, { error: "line_name_too_long" });

/** A line's note, such as "chopped", trimmed. Blank is none. */
const LineNoteSchema = z
  .string({ error: "invalid_request" })
  .trim()
  .max(MAX_LINE_NOTE_LENGTH, { error: "line_note_too_long" })
  .transform((s) => s || null);

/** The amount as the recipe writes it, for display beside the grams: `{ amount: 2, unit: "clove" }`. */
export const WrittenAmountSchema = z.strictObject(
  {
    amount: z
      .number({ error: "written_amount_invalid" })
      .refine((v) => v > 0 && v <= MAX_WRITTEN_AMOUNT && hasAtMostDecimals(v, 2), {
        error: "written_amount_invalid",
      }),
    unit: z.enum(INGREDIENT_UNITS, { error: "written_amount_invalid" }),
  },
  { error: "written_amount_invalid" },
);

/** The fields of a counted line, beside its id. A cook's line adds its own. */
export const countedLineFields = {
  counted: z.literal(true),
  foodId: z.uuid(),
  /** `{ grams }`, or `{ portionId, count }`, a count of one of the food's portions, as an entry takes it. */
  amount: FoodAmountSchema,
  written: WrittenAmountSchema.nullable().default(null),
  note: LineNoteSchema.nullable().default(null),
};

/** The fields of a line not counted, beside its id. */
export const notCountedLineFields = {
  counted: z.literal(false),
  name: LineNameSchema,
  written: WrittenAmountSchema.nullable().default(null),
  note: LineNoteSchema.nullable().default(null),
};

/**
 * One line of a recipe: a food with its amount, which counts, or a name
 * alone, such as salt, which adds nothing. The client chooses the id, and
 * an edit keeps it, so a line stays the same line.
 */
export const IngredientLineBodySchema = z.discriminatedUnion(
  "counted",
  [z.strictObject({ id: z.uuid(), ...countedLineFields }), z.strictObject({ id: z.uuid(), ...notCountedLineFields })],
  { error: "invalid_request" },
);

/** A line as a draft sends it, its id left out where the caller has none yet. */
export const IngredientLineDraftSchema = z.discriminatedUnion(
  "counted",
  [
    z.strictObject({ id: z.uuid().optional(), ...countedLineFields }),
    z.strictObject({ id: z.uuid().optional(), ...notCountedLineFields }),
  ],
  { error: "invalid_request" },
);

/** 1 to 60 lines of `line`. */
export const linesOf = <L extends z.ZodType>(line: L) =>
  z
    .array(line, { error: "recipe_lines_required" })
    .min(1, { error: "recipe_lines_required" })
    .max(MAX_RECIPE_LINES, { error: "recipe_lines_too_many" });

/** Whether each line that carries an id carries its own, compared without case. */
export const distinctLineIds = (lines: { id?: string }[]): boolean => {
  const ids = lines.flatMap((l) => (l.id === undefined ? [] : [l.id.toLowerCase()]));
  return new Set(ids).size === ids.length;
};

/** Tags once each, compared without case: the first spelling stays. */
const distinctTags = (tags: string[]) => {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const recipeFields = {
  name: NameSchema,
  servings: RecipeServingsSchema,
  timeMinutes: RecipeMinutesSchema.nullable().default(null),
  lines: linesOf(IngredientLineBodySchema).refine(distinctLineIds, { error: "invalid_request" }),
  steps: z.array(StepSchema).max(MAX_RECIPE_STEPS, { error: "steps_too_many" }).default([]),
  notes: RecipeNotesSchema.nullable().default(null),
  tags: z.array(TagSchema).max(MAX_RECIPE_TAGS, { error: "tags_too_many" }).default([]).transform(distinctTags),
};

/** `POST /recipes`. The client chooses the id, so a repeated create applies once. */
export const RecipeBodySchema = z.object({ id: z.uuid(), ...recipeFields });
/** `PUT /recipes/:id`: the whole recipe. A line keeps the id it was read with. */
export const RecipeEditBodySchema = z.object(recipeFields);
/** `POST /recipes/preview`: what a draft comes to, written nowhere. */
export const RecipePreviewBodySchema = z.object({
  servings: RecipeServingsSchema,
  lines: linesOf(IngredientLineDraftSchema),
});

/** A line as the API shows it. */
export const RecipeLineSchema = z.object({
  id: z.uuid(),
  /** The line's place in the recipe, from 0. */
  position: z.number().int(),
  counted: z.boolean(),
  /** The food of a counted line, read even when it is hidden or retired since. Null on a line not counted. */
  food: z
    .object({
      id: z.uuid(),
      /** In the user's food-name language. */
      name: z.string(),
      source: z.enum(FOOD_SOURCES),
      per100g: FiguresSchema,
      retired: z.boolean(),
      deleted: z.boolean(),
    })
    .nullable(),
  /** The name of a line not counted. */
  name: z.string().nullable(),
  grams: z.number().nullable(),
  portion: EntrySchema.shape.portion,
  written: z.object({ amount: z.number(), unit: z.enum(INGREDIENT_UNITS) }).nullable(),
  note: z.string().nullable(),
});

export const RecipeSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  servings: z.number().int(),
  timeMinutes: z.number().int().nullable(),
  tags: z.array(z.string()),
  favourite: z.boolean(),
  archived: z.boolean(),
  /** One serving's figures, rounded as shown. */
  perServing: FiguresSchema,
  /** One serving at the precision an entry stores, so an entry's figures can be previewed. */
  basis: FiguresSchema,
  /** The latest date the recipe is on, planned or eaten. */
  lastPutOn: IsoDateSchema.nullable(),
  /** The servings of the latest eaten entry of it. */
  lastServings: z.number().nullable(),
  imageId: z.uuid().nullable(),
  /** A line's food was deleted or retired since. */
  foodsGone: z.boolean(),
});

export const RecipeSchema = RecipeSummarySchema.extend({
  deleted: z.boolean(),
  /** All of its servings, as one entry of them all would show. */
  whole: FiguresSchema,
  lines: z.array(RecipeLineSchema),
  steps: z.array(z.string()),
  notes: z.string().nullable(),
});

/** A recipe at another number of servings: its lines' amounts and its figures at that size. */
export const ScaledRecipeSchema = z.object({
  servings: z.number(),
  lines: z.array(RecipeLineSchema),
  figures: FiguresSchema,
});

export const RecipeListSchema = z.object({ recipes: z.array(RecipeSummarySchema) });

/** What a draft comes to, line by line, written nowhere. Every line is checked, not only the first refused one. */
export const RecipePreviewSchema = z.object({
  lines: z.array(
    z.object({
      /** The line's place in the draft, from 0. */
      index: z.number().int(),
      /** The food as the app reads it, in the user's language. Null for a line not counted or a food not found. */
      foodName: z.string().nullable(),
      /** What the app stores: the grams sent, or what a count of a portion comes to. */
      grams: z.number().nullable(),
      portion: EntrySchema.shape.portion,
      refusal: z.enum(ERROR_CODES).nullable(),
    }),
  ),
  /** Null while any line is refused, or the draft is. */
  perServing: FiguresSchema.nullable(),
  whole: FiguresSchema.nullable(),
  basis: FiguresSchema.nullable(),
  /** A refusal of the whole draft, such as recipe_serving_too_large. */
  refusal: z.enum(ERROR_CODES).nullable(),
});

export const RECIPE_SORTS = ["name", "lastPutOn", "protein", "energy"] as const;

/** A recipe filter as JSON: what `filterRecipes`, `listRecipes` and the `list_recipes` tool take. */
export const RecipeFilterSchema = z.object({
  archived: z.boolean().default(false),
  /** Every word in the name or a tag, case and accents folded. */
  q: z.string().max(100).optional(),
  /** Recipes with all of these tags. */
  tags: z.array(TagSchema).max(MAX_RECIPE_TAGS).optional(),
  /** Per serving, as shown. */
  minProteinG: z.number().min(0).optional(),
  maxProteinG: z.number().min(0).optional(),
  minEnergyKcal: z.number().min(0).optional(),
  maxEnergyKcal: z.number().min(0).optional(),
  favourites: z.boolean().optional(),
  sort: z.enum(RECIPE_SORTS).default("name"),
});

/** A query string flag, as SavedMealsQuerySchema takes `archived`: "true" or "false", never Boolean(value). */
const queryFlag = z.enum(["true", "false"]).transform((v) => v === "true");

/**
 * The query of `GET /recipes`, as Express hands it over: strings, and a
 * repeated key as an array. Parses to a RecipeFilter.
 */
export const RecipeQuerySchema = z.object({
  archived: queryFlag.default(false),
  q: z.string().max(100).optional(),
  // ?tags=a gives a string, ?tags=a&tags=b an array: both become an array.
  tags: z
    .union([TagSchema, z.array(TagSchema).max(MAX_RECIPE_TAGS)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  minProteinG: z.coerce.number().min(0).optional(),
  maxProteinG: z.coerce.number().min(0).optional(),
  minEnergyKcal: z.coerce.number().min(0).optional(),
  maxEnergyKcal: z.coerce.number().min(0).optional(),
  favourites: queryFlag.optional(),
  sort: z.enum(RECIPE_SORTS).default("name"),
});

/** The query of `GET /recipes/:id`: with `servings`, the recipe scaled to that many as well. */
export const RecipeReadQuerySchema = z.object({
  servings: z.coerce.number().pipe(RecipeServingsSchema).optional(),
});

export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];
export type RecipeSort = (typeof RECIPE_SORTS)[number];
export type WrittenAmount = z.infer<typeof WrittenAmountSchema>;
export type IngredientLineBody = z.output<typeof IngredientLineBodySchema>;
export type IngredientLineDraft = z.output<typeof IngredientLineDraftSchema>;
export type RecipeBody = z.output<typeof RecipeBodySchema>;
export type RecipeEditBody = z.output<typeof RecipeEditBodySchema>;
export type RecipePreviewBody = z.output<typeof RecipePreviewBodySchema>;
export type RecipeLine = z.infer<typeof RecipeLineSchema>;
export type RecipeSummary = z.infer<typeof RecipeSummarySchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type ScaledRecipe = z.infer<typeof ScaledRecipeSchema>;
export type RecipeList = z.infer<typeof RecipeListSchema>;
export type RecipePreview = z.infer<typeof RecipePreviewSchema>;
export type RecipeFilter = z.output<typeof RecipeFilterSchema>;
export type RecipeQuery = z.output<typeof RecipeQuerySchema>;
