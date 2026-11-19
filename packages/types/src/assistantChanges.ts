import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { ENTRY_KINDS, ENTRY_STATUSES } from "./entries.js";
import { FiguresSchema } from "./figures.js";
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
 */
export const AssistantEntryLineSchema = z.object({
  name: z.string(),
  date: IsoDateSchema,
  status: z.enum(ENTRY_STATUSES),
  kind: z.enum(ENTRY_KINDS),
  amount: z
    .union([
      z.object({ portionLabel: z.string(), count: z.number(), grams: z.number() }),
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
  // food, portion, favourite
  z.object({ entity: z.literal("food"), name: z.string(), changes: z.array(AssistantFieldChangeSchema) }),
  z.object({ entity: z.literal("saved_meal"), name: z.string(), changes: z.array(AssistantFieldChangeSchema) }),
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

export type AssistantChangeAction = z.infer<typeof AssistantChangeActionSchema>;
export type AssistantEntryLine = z.infer<typeof AssistantEntryLineSchema>;
export type AssistantFieldChange = z.infer<typeof AssistantFieldChangeSchema>;
export type AssistantChangeSummary = z.infer<typeof AssistantChangeSummarySchema>;
export type AssistantChange = z.infer<typeof AssistantChangeSchema>;
