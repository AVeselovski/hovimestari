import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { ENTRY_KINDS, ENTRY_STATUSES } from "./entries.js";
import { FiguresSchema } from "./figures.js";
import { FINELI_PORTION_UNITS } from "./foods.js";
import { INGREDIENT_UNITS } from "./recipes.js";
import { TargetRangesSchema } from "./targets.js";

/**
 * Every kind of change an assistant can make, as the record names it. The
 * CHECK on `assistant_changes.action` lists the same values.
 */
export const ASSISTANT_CHANGE_ACTIONS = [
  "entry.added",
  "entry.changed",
  "entries.marked",
  "entries.copied",
  "entries.removed",
  "entry.restored",
  "food.created",
  "food.changed",
  "portion.added",
  "portion.changed",
  "favourite.set",
  "favourite.unset",
  "saved_meal.created",
  "saved_meal.changed",
  "saved_meal.archived",
  "saved_meal.restored",
  "targets.set",
  "targets.removed",
  "deletion.requested",
  "recipe.created",
  "recipe.changed",
  "recipe.archived",
  "recipe.restored",
  "recipe.favourite_set",
  "recipe.favourite_unset",
] as const;

export const AssistantChangeActionSchema = z.enum(ASSISTANT_CHANGE_ACTIONS);

/** The statuses a deletion request can read as. */
export const DELETION_STATUSES = ["pending", "approved", "declined", "gone", "withdrawn", "expired"] as const;

/**
 * An entry in a change's summary, with the values the answer had. A food's
 * amount is its grams, or a count of a portion with the portion's label and
 * the grams it came to. A saved meal's is its count. An estimate has none.
 * The portion form is listed first, because a union takes the first form
 * that fits and would read a portion amount as grams alone.
 *
 * `portionLabel` is the portion's own name, else its Fineli unit's code.
 * `portionUnit` is the Fineli unit's code, or null for a portion of the
 * person's own, so a reader names the portion as the Day tab does. Rows
 * recorded before it was added have no `portionUnit`.
 */
export const AssistantEntryLineSchema = z.object({
  name: z.string(),
  date: IsoDateSchema,
  status: z.enum(ENTRY_STATUSES),
  kind: z.enum(ENTRY_KINDS),
  amount: z
    .union([
      z.object({
        portionLabel: z.string(),
        portionUnit: z.enum(FINELI_PORTION_UNITS).nullable().optional(),
        count: z.number(),
        grams: z.number(),
      }),
      z.object({ grams: z.number() }),
      z.object({ count: z.number() }),
    ])
    .nullable(),
  figures: FiguresSchema,
});

/** One field a change set, from its value before to its value after. */
export const AssistantFieldChangeSchema = z.object({
  field: z.enum(["date", "status", "amount", "name", "figures", "note", "per100g", "barcode", "grams", "source"]),
  from: z.unknown(),
  to: z.unknown(),
});

/** A recipe line the record names whole: its food's name, or its own when it does not count, and its grams when it counts. */
export const RecipeLineRecordSchema = z.object({ name: z.string(), grams: z.number().nullable() });

/** A value before and after. The record holds one only when the two differ. */
const fromTo = <T extends z.ZodType>(value: T) => z.object({ from: value, to: value });

/** How a piece of text changed, its words left out: notes run long. */
export const TextChangeSchema = z.enum(["added", "changed", "removed"]);

/**
 * A line an edit kept, by its id, and what about it changed. `name` is the
 * line's name after the edit. Each other key is there only when that part
 * changed: `food` the food it points at (its name before), `grams`, the
 * portion and its count, the amount as written, and the note. A line whose
 * change none of them shows, such as another portion of the same name and
 * count, has none.
 */
export const RecipeLineChangeSchema = z.object({
  name: z.string(),
  food: z.object({ from: z.string() }).optional(),
  grams: fromTo(z.number().nullable()).optional(),
  portion: fromTo(
    z
      .object({ count: z.number(), unit: z.enum(FINELI_PORTION_UNITS).nullable(), name: z.string().nullable() })
      .nullable(),
  ).optional(),
  written: fromTo(z.object({ amount: z.number(), unit: z.enum(INGREDIENT_UNITS) }).nullable()).optional(),
  note: TextChangeSchema.optional(),
});

/**
 * One field of a recipe a change set. `from` is null on a create. The lines
 * are the ones added, removed and changed, and whether the kept ones moved:
 * a create adds them all. Lines are matched by id. The method is compared by
 * its steps' text: its count of steps before and after, how many steps
 * were added and how many removed, the numbers, from 1 as in the method
 * after, of the steps reworded in place, and whether the steps both sides
 * hold moved. A create adds every step. The notes say only how they changed.
 */
export const RecipeFieldChangeSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("name"), from: z.string(), to: z.string() }),
  z.object({ field: z.literal("servings"), from: z.number().int().nullable(), to: z.number().int() }),
  z.object({ field: z.literal("time"), from: z.number().int().nullable(), to: z.number().int().nullable() }),
  z.object({
    field: z.literal("lines"),
    added: z.array(RecipeLineRecordSchema),
    removed: z.array(RecipeLineRecordSchema),
    changed: z.array(RecipeLineChangeSchema),
    reordered: z.boolean(),
  }),
  z.object({
    field: z.literal("steps"),
    from: z.number().int().nonnegative().nullable(),
    to: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    changed: z.array(z.number().int().positive()),
    reordered: z.boolean(),
  }),
  z.object({ field: z.literal("notes"), change: TextChangeSchema }),
  z.object({ field: z.literal("tags"), from: z.array(z.string()).nullable(), to: z.array(z.string()) }),
]);

/**
 * What a person needs to read one line of the record. Values as the change's
 * answer had them, never a value the record computes. Names are data.
 */
export const AssistantChangeSummarySchema = z.discriminatedUnion("entity", [
  // entry.added, entry.changed, entry.restored
  z.object({
    entity: z.literal("entry"),
    entry: AssistantEntryLineSchema,
    changes: z.array(AssistantFieldChangeSchema),
  }),
  // entries.marked, entries.copied, entries.removed
  z.object({
    entity: z.literal("entries"),
    entries: z.array(AssistantEntryLineSchema),
    toDate: IsoDateSchema.nullable(),
  }),
  // food, portion, favourite. `portion`, for portion.changed only: the
  // portion's name after the change. Rows recorded before it was added have none.
  z.object({
    entity: z.literal("food"),
    name: z.string(),
    portion: z.string().optional(),
    changes: z.array(AssistantFieldChangeSchema),
  }),
  z.object({ entity: z.literal("saved_meal"), name: z.string(), changes: z.array(AssistantFieldChangeSchema) }),
  // recipe.created, recipe.changed, recipe.archived, recipe.restored, recipe.favourite_set, recipe.favourite_unset
  z.object({ entity: z.literal("recipe"), name: z.string(), changes: z.array(RecipeFieldChangeSchema) }),
  z.object({
    entity: z.literal("targets"),
    effectiveFrom: IsoDateSchema,
    before: TargetRangesSchema.nullable(),
    after: TargetRangesSchema.nullable(),
  }),
  z.object({
    entity: z.literal("deletion"),
    requestId: z.uuid(),
    kind: z.enum(["own_food", "saved_meal"]),
    name: z.string(),
  }),
]);

/** One change in the record, as a person reads it. The ids it touched stay out: only a replay reads them. */
export const AssistantChangeSchema = z.object({
  id: z.uuid(),
  action: AssistantChangeActionSchema,
  at: z.iso.datetime(),
  connectionName: z.string(),
  summary: AssistantChangeSummarySchema,
  /** For deletion.requested only: the request's status now. */
  deletionStatus: z.enum(DELETION_STATUSES).nullable(),
});

/** The changes a page answers when the request names no limit. */
export const DEFAULT_CHANGE_PAGE_SIZE = 50;

/** The most changes one page answers. */
export const MAX_CHANGE_PAGE_SIZE = 100;

/**
 * `GET /connections/:id/changes`. `cursor` is the `nextCursor` of the page
 * before, or left out for the newest page. It is opaque: a client passes it
 * back as it came.
 */
export const AssistantChangePageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_CHANGE_PAGE_SIZE).default(DEFAULT_CHANGE_PAGE_SIZE),
});

/**
 * One page of a connection's record, newest first. `nextCursor` reads the
 * page after this one, and is null on the last page.
 */
export const AssistantChangePageSchema = z.object({
  changes: z.array(AssistantChangeSchema),
  nextCursor: z.string().nullable(),
});

export type AssistantChangeAction = z.infer<typeof AssistantChangeActionSchema>;
export type AssistantEntryLine = z.infer<typeof AssistantEntryLineSchema>;
export type AssistantFieldChange = z.infer<typeof AssistantFieldChangeSchema>;
export type RecipeLineRecord = z.infer<typeof RecipeLineRecordSchema>;
export type RecipeLineChange = z.infer<typeof RecipeLineChangeSchema>;
export type RecipeFieldChange = z.infer<typeof RecipeFieldChangeSchema>;
export type AssistantChangeSummary = z.infer<typeof AssistantChangeSummarySchema>;
export type AssistantChange = z.infer<typeof AssistantChangeSchema>;
export type AssistantChangePageQuery = z.input<typeof AssistantChangePageQuerySchema>;
export type AssistantChangePage = z.infer<typeof AssistantChangePageSchema>;
