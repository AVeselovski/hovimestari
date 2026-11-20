import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { DaySchema } from "./days.js";
import { ENTRY_STATUSES, EntryCountSchema, EntrySchema, NameSchema } from "./entries.js";
import { FiguresSchema } from "./figures.js";
import {
  countedLineFields,
  distinctLineIds,
  linesOf,
  notCountedLineFields,
  RecipeLineSchema,
  RecipeServingsSchema,
} from "./recipes.js";

// A cook is one batch made from a recipe on one occasion: its own lines and
// the servings it gave, while the recipe stays as written. Entries on one or
// more days draw servings from it and carry its figures. Each line may name
// the recipe line it started as (`fromLineId`), a hint `cookDiff` reads to
// say what the batch changed. A line the batch added names none.

/** The most entries one cook attaches and adds in one request. */
export const MAX_COOK_ENTRIES = 20;

/** The recipe line a cook's line started as, or null for a line the batch added. */
const FromLineIdSchema = z.uuid().nullable().default(null);

/** One line of a cook: a recipe line as the batch had it, with the recipe line it started as. */
export const CookLineBodySchema = z.discriminatedUnion(
  "counted",
  [
    z.strictObject({ id: z.uuid(), ...countedLineFields, fromLineId: FromLineIdSchema }),
    z.strictObject({ id: z.uuid(), ...notCountedLineFields, fromLineId: FromLineIdSchema }),
  ],
  { error: "invalid_request" },
);

/** A cook's line as an assistant sends it, its id left out: the app makes one. */
export const CookLineDraftSchema = z.discriminatedUnion(
  "counted",
  [
    z.strictObject({ id: z.uuid().optional(), ...countedLineFields, fromLineId: FromLineIdSchema }),
    z.strictObject({ id: z.uuid().optional(), ...notCountedLineFields, fromLineId: FromLineIdSchema }),
  ],
  { error: "invalid_request" },
);

/** Whether no two lines start as the same recipe line, compared without case. */
export const distinctFromLines = (lines: { fromLineId: string | null }[]): boolean => {
  const ids = lines.flatMap((l) => (l.fromLineId === null ? [] : [l.fromLineId.toLowerCase()]));
  return new Set(ids).size === ids.length;
};

const uniqueIds = (ids: string[]) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length;

/** A new entry from the batch, with its own client-chosen id. */
export const CookAddSchema = z.object({
  id: z.uuid(),
  date: IsoDateSchema,
  status: z.enum(ENTRY_STATUSES),
  servings: EntryCountSchema,
});

const cookLines = linesOf(CookLineBodySchema)
  .refine(distinctLineIds, { error: "invalid_request" })
  .refine(distinctFromLines, { error: "invalid_request" });

/**
 * `POST /cooks`: a batch as made, and the entries it feeds. `attach` names
 * the person's plain entries of this recipe that came from it, `add` puts
 * new servings of it on days, and `attachStatus` marks an attached entry in
 * the same transaction. At least one entry, attached or added.
 */
export const CookBodySchema = z
  .object({
    /** Chosen by the client, so a repeated request applies once. */
    id: z.uuid(),
    recipeId: z.uuid(),
    /** The day it was made. */
    date: IsoDateSchema,
    /** What the batch gave, a whole number from 1 to 100. */
    servings: RecipeServingsSchema,
    lines: cookLines,
    attach: z.array(z.uuid()).max(MAX_COOK_ENTRIES).refine(uniqueIds, { error: "invalid_request" }).default([]),
    add: z
      .array(CookAddSchema)
      .max(MAX_COOK_ENTRIES)
      .refine((list) => uniqueIds(list.map((a) => a.id)), { error: "invalid_request" })
      .default([]),
    attachStatus: z
      .array(z.object({ id: z.uuid(), status: z.enum(ENTRY_STATUSES) }))
      .max(MAX_COOK_ENTRIES)
      .refine((list) => uniqueIds(list.map((a) => a.id)), { error: "invalid_request" })
      .default([]),
  })
  .refine((b) => b.attach.length + b.add.length >= 1, { error: "cook_entries_required" })
  .refine((b) => b.attach.length + b.add.length <= MAX_COOK_ENTRIES, { error: "invalid_request" })
  .refine((b) => uniqueIds([...b.attach, ...b.add.map((a) => a.id)]), { error: "invalid_request" })
  .refine(
    (b) => {
      const attached = new Set(b.attach.map((id) => id.toLowerCase()));
      return b.attachStatus.every((s) => attached.has(s.id.toLowerCase()));
    },
    { error: "cook_entry_invalid" },
  );

/** `POST /cooks/:id/recipe`: the batch saved as a new recipe, with the id the client chose. */
export const CookAsRecipeBodySchema = z.object({
  id: z.uuid(),
  /** The new recipe's name, as typed. */
  name: NameSchema,
});

/** What the batch changed from its recipe as it is now. Empty lists and null servings: it did not. */
export const CookDiffSchema = z.object({
  /** The recipe's servings and the batch's, or null when they are equal. */
  servings: z.object({ recipe: z.number().int(), cook: z.number().int() }).nullable(),
  /** The cook's lines that started as a recipe line and differ from it, and in what. */
  changed: z.array(
    z.object({
      lineId: z.uuid(),
      fromLineId: z.uuid(),
      fields: z.array(z.enum(["food", "amount", "written", "name"])),
    }),
  ),
  /** The cook's lines that started as no line of the recipe. */
  added: z.array(z.uuid()),
  /** The recipe's lines no line of the cook started as. */
  leftOut: z.array(z.uuid()),
});

/** A cook's line as the API shows it: a recipe line, and the recipe line it started as. */
export const CookLineSchema = RecipeLineSchema.extend({ fromLineId: z.uuid().nullable() });

export const CookSchema = z.object({
  id: z.uuid(),
  /** Its recipe as it is now. A deleted one still opens by its id. */
  recipe: z.object({ id: z.uuid(), name: z.string(), servings: z.number().int(), deleted: z.boolean() }),
  /** The day it was made. */
  date: IsoDateSchema,
  /** What the batch gave. */
  servings: z.number().int(),
  lines: z.array(CookLineSchema),
  /** One serving's figures, rounded as shown. */
  perServing: FiguresSchema,
  /** All of its servings. */
  whole: FiguresSchema,
  /** One serving at the precision an entry stores: the basis of every entry from it. */
  basis: FiguresSchema,
  diff: CookDiffSchema,
  /** Every entry from it, by date and position. */
  entries: z.array(EntrySchema),
});

/** What `POST /cooks` answers: the cook, the entries it attached and added, and their days. */
export const CookWriteResultSchema = z.object({
  cook: CookSchema,
  entries: z.array(EntrySchema),
  days: z.array(DaySchema),
  outcome: z.enum(["created", "replayed"]),
});

/** A line as `cookDiff` compares it. */
export interface DiffLine {
  id: string;
  foodId: string | null;
  grams: number | null;
  written: { amount: number; unit: string } | null;
  name: string | null;
}

type DiffField = z.infer<typeof CookDiffSchema>["changed"][number]["fields"][number];

/**
 * What a batch changed from its recipe: its servings when they differ, each
 * cook line that started as a recipe line and differs from it in its food,
 * its grams, its amount as written or its name, the lines it added and the
 * recipe lines it left out. A note is not compared: it changes nothing
 * made. A line naming a recipe line the recipe no longer holds counts as
 * added. The order of the lines is not compared.
 */
export function cookDiff(
  recipeLines: readonly DiffLine[],
  recipeServings: number,
  cookLines: readonly (DiffLine & { fromLineId: string | null })[],
  cookServings: number,
): CookDiff {
  const recipeById = new Map(recipeLines.map((l) => [l.id, l]));
  const used = new Set<string>();
  const changed: CookDiff["changed"] = [];
  const added: string[] = [];
  for (const line of cookLines) {
    const from = line.fromLineId === null ? undefined : recipeById.get(line.fromLineId);
    if (!from || used.has(from.id)) {
      added.push(line.id);
      continue;
    }
    used.add(from.id);
    const fields: DiffField[] = [];
    if (from.foodId !== line.foodId) fields.push("food");
    if (from.grams !== line.grams) fields.push("amount");
    if (from.written?.amount !== line.written?.amount || from.written?.unit !== line.written?.unit) {
      fields.push("written");
    }
    if (from.name !== line.name) fields.push("name");
    if (fields.length > 0) changed.push({ lineId: line.id, fromLineId: from.id, fields });
  }
  return {
    servings: recipeServings === cookServings ? null : { recipe: recipeServings, cook: cookServings },
    changed,
    added,
    leftOut: recipeLines.filter((l) => !used.has(l.id)).map((l) => l.id),
  };
}

/** Whether a batch differs from its recipe at all. */
export const cookDiffers = (diff: CookDiff): boolean =>
  diff.servings !== null || diff.changed.length + diff.added.length + diff.leftOut.length > 0;

export type CookLineBody = z.output<typeof CookLineBodySchema>;
export type CookLineDraft = z.output<typeof CookLineDraftSchema>;
export type CookAdd = z.output<typeof CookAddSchema>;
export type CookBody = z.output<typeof CookBodySchema>;
export type CookAsRecipeBody = z.output<typeof CookAsRecipeBodySchema>;
export type CookDiff = z.infer<typeof CookDiffSchema>;
export type CookLine = z.infer<typeof CookLineSchema>;
export type Cook = z.infer<typeof CookSchema>;
export type CookWriteResult = z.infer<typeof CookWriteResultSchema>;
