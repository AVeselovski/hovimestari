import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { FiguresSchema } from "./figures.js";
import { FINELI_PORTION_UNITS, FOOD_SOURCES } from "./foods.js";
import { hasAtMostDecimals } from "./numbers.js";

/** The kinds of entry. */
export const ENTRY_KINDS = ["food", "saved_meal", "estimate", "recipe"] as const;
/** Every entry is planned or eaten. */
export const ENTRY_STATUSES = ["planned", "eaten"] as const;

/** The heaviest food entry, in grams, with one decimal. */
export const MAX_ENTRY_GRAMS = 5000;
/** The largest portion, meal or serving count, with two decimals. */
export const MAX_ENTRY_COUNT = 100;
/** The largest typed energy, in kcal, with one decimal: estimates and saved meals. */
export const MAX_FIGURE_KCAL = 10000;
/** The largest typed macro, in grams, with one decimal: estimates and saved meals. */
export const MAX_FIGURE_G = 1000;
/** The longest saved meal or estimate name, in characters. */
export const MAX_NAME_LENGTH = 120;
/** The longest estimate note, in characters. */
export const MAX_NOTE_LENGTH = 500;
/** How many entries one status change or one copy takes at most. */
export const MAX_ENTRY_BATCH = 100;

/** A food entry's weight: above zero, up to 5000 g, one decimal. */
export const EntryGramsSchema = z
  .number({ error: "entry_grams_invalid" })
  .refine((v) => v > 0 && v <= MAX_ENTRY_GRAMS && hasAtMostDecimals(v, 1), { error: "entry_grams_invalid" });

/** A portion, meal or serving count: above zero, up to 100, two decimals. */
export const EntryCountSchema = z
  .number({ error: "entry_count_invalid" })
  .refine((v) => v > 0 && v <= MAX_ENTRY_COUNT && hasAtMostDecimals(v, 2), { error: "entry_count_invalid" });

/** A typed figure from 0 to `max`, one decimal. */
const figure = (max: number) =>
  z
    .number({ error: (issue) => (issue.input === undefined ? "figure_required" : "figure_invalid") })
    .refine((v) => v >= 0 && v <= max && hasAtMostDecimals(v, 1), { error: "figure_invalid" });

/** A saved meal's or an estimate's own figures. All four are required. */
export const TypedFiguresSchema = z.object({
  energyKcal: figure(MAX_FIGURE_KCAL),
  proteinG: figure(MAX_FIGURE_G),
  carbsG: figure(MAX_FIGURE_G),
  fatG: figure(MAX_FIGURE_G),
});

/** A saved meal's or an estimate's name, trimmed. */
export const NameSchema = z
  .string({ error: "name_required" })
  .trim()
  .min(1, { error: "name_required" })
  .max(MAX_NAME_LENGTH, { error: "name_too_long" });

/** An estimate's note, trimmed. Blank is no note. */
export const NoteSchema = z
  .string({ error: "invalid_request" })
  .trim()
  .max(MAX_NOTE_LENGTH, { error: "note_too_long" })
  .transform((s) => s || null);

/**
 * A food entry's amount: `{ grams }`, or `{ portionId, count }`, a count of
 * one of the food's portions. One object with a refinement rather than a
 * union, so a bad weight or count answers its own code.
 */
export const FoodAmountSchema = z
  .strictObject(
    { grams: EntryGramsSchema.optional(), portionId: z.uuid().optional(), count: EntryCountSchema.optional() },
    { error: "invalid_request" },
  )
  .refine(
    (a) =>
      a.grams !== undefined
        ? a.portionId === undefined && a.count === undefined
        : a.portionId !== undefined && a.count !== undefined,
    { error: "invalid_request" },
  )
  .transform((a): { grams: number } | { portionId: string; count: number } =>
    a.grams !== undefined ? { grams: a.grams } : { portionId: a.portionId!, count: a.count! },
  );

const common = {
  /** Chosen by the client, so a repeated request applies once. */
  id: z.uuid(),
  date: IsoDateSchema,
  status: z.enum(ENTRY_STATUSES),
};

export const AddEntryBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food"), foodId: z.uuid(), amount: FoodAmountSchema, ...common }),
  z.object({ kind: z.literal("saved_meal"), savedMealId: z.uuid(), count: EntryCountSchema, ...common }),
  z.object({
    kind: z.literal("estimate"),
    name: NameSchema,
    figures: TypedFiguresSchema,
    note: NoteSchema.nullable().default(null),
    ...common,
  }),
  z.object({ kind: z.literal("recipe"), recipeId: z.uuid(), servings: EntryCountSchema, ...common }),
]);

/** What a PATCH may change. At least one field. A field that does not fit the entry's kind answers entry_kind_mismatch. */
export const EntryPatchBodySchema = z
  .object({
    /** A move. */
    date: IsoDateSchema.optional(),
    status: z.enum(ENTRY_STATUSES).optional(),
    /** Food entries only. */
    amount: FoodAmountSchema.optional(),
    /** Saved meal entries only. */
    count: EntryCountSchema.optional(),
    /** Recipe entries only. */
    servings: EntryCountSchema.optional(),
    /** Estimates only. */
    name: NameSchema.optional(),
    figures: TypedFiguresSchema.optional(),
    note: NoteSchema.nullable().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { error: "invalid_request" });

const uniqueIds = (ids: string[]) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length;

/** `POST /entries/status`: the entries to change, as listed on screen. */
export const EntryStatusBodySchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(MAX_ENTRY_BATCH),
  status: z.enum(ENTRY_STATUSES),
});

/** `POST /entries/remove`: the entries to remove, such as the copies an Undo takes back. */
export const EntryRemoveManyBodySchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(MAX_ENTRY_BATCH).refine(uniqueIds, { error: "invalid_request" }),
});

/** `POST /entries/copy`: each source entry with the id its copy takes. */
export const CopyEntriesBodySchema = z.object({
  toDate: IsoDateSchema,
  entries: z
    .array(z.object({ sourceId: z.uuid(), id: z.uuid() }))
    .min(1)
    .max(MAX_ENTRY_BATCH)
    .refine((list) => uniqueIds(list.map((e) => e.id)), { error: "invalid_request" }),
});

export const EntrySchema = z.object({
  id: z.uuid(),
  date: IsoDateSchema,
  /** The order within a day: the order entries were added. */
  position: z.number().int(),
  status: z.enum(ENTRY_STATUSES),
  kind: z.enum(ENTRY_KINDS),
  /** A food's name in the user's language, a meal's, a recipe's or an estimate's own. A recipe's as it is now. */
  name: z.string(),
  food: z.object({ id: z.uuid(), source: z.enum(FOOD_SOURCES), retired: z.boolean(), deleted: z.boolean() }).nullable(),
  savedMeal: z
    .object({ id: z.uuid(), source: z.string().nullable(), archived: z.boolean(), deleted: z.boolean() })
    .nullable(),
  grams: z.number().nullable(),
  /** How a food's amount was entered. `id` is null when the portion no longer exists. */
  portion: z
    .object({
      id: z.uuid().nullable(),
      unit: z.enum(FINELI_PORTION_UNITS).nullable(),
      name: z.string().nullable(),
      count: z.number(),
    })
    .nullable(),
  /** A saved meal entry's count of meals. */
  count: z.number().nullable(),
  /** A recipe entry's servings, with up to two decimals. */
  servings: z.number().nullable(),
  /** A recipe entry's recipe. A deleted one still opens by its id. */
  recipe: z.object({ id: z.uuid(), archived: z.boolean(), deleted: z.boolean() }).nullable(),
  note: z.string().nullable(),
  /**
   * The values the entry's figures are computed from, as stored: set when the entry is
   * added, replaced when an estimate's figures are edited, and rewritten on planned
   * entries dated today or later when their own food, saved meal or recipe, or an own food
   * on the recipe, is edited. Per kind:
   * - food: per 100 g of the food. figures = entryFigures(basis, { per: "100g", grams })
   * - saved_meal: per one meal. figures = entryFigures(basis, { per: "meal", count })
   * - estimate: the whole entry, the typed figures. figures = entryFigures(basis, { per: "whole" })
   * - recipe: one serving of the recipe. figures = entryFigures(basis, { per: "serving", count: servings })
   * Not rounded for display: kcal with up to two decimals, grams with up to three, as the
   * columns hold them.
   */
  basis: FiguresSchema,
  figures: FiguresSchema,
  isEstimate: z.boolean(),
});

export type EntryKind = (typeof ENTRY_KINDS)[number];
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type TypedFigures = z.infer<typeof TypedFiguresSchema>;
export type FoodAmount = z.infer<typeof FoodAmountSchema>;
export type AddEntryBody = z.infer<typeof AddEntryBodySchema>;
export type EntryPatchBody = z.infer<typeof EntryPatchBodySchema>;
export type EntryStatusBody = z.infer<typeof EntryStatusBodySchema>;
export type CopyEntriesBody = z.infer<typeof CopyEntriesBodySchema>;
export type EntryRemoveManyBody = z.infer<typeof EntryRemoveManyBodySchema>;
export type Entry = z.infer<typeof EntrySchema>;
