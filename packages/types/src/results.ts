import { z } from "zod";
import { DaySchema } from "./days.js";
import { EntrySchema } from "./entries.js";
import { SavedMealSchema } from "./savedMeals.js";

// What the entry and saved meal writes answer. Each holds the days it
// changed, so it lives apart from days.ts, which entries.ts and
// savedMeals.ts feed.

/**
 * What an add, an edit or a restore answers. `outcome` says whether this
 * request wrote: `replayed` means the id was already added, or added and then
 * removed, and `entry` is null in that last case.
 */
export const EntryWriteResultSchema = z.object({
  entry: EntrySchema.nullable(),
  days: z.array(DaySchema),
  outcome: z.enum(["created", "replayed", "changed"]),
});

/** What `POST /entries/status` answers: the entries it changed and their days. */
export const EntryStatusResultSchema = z.object({ changedIds: z.array(z.uuid()), days: z.array(DaySchema) });

/** What `POST /entries/copy` answers. */
export const CopyEntriesResultSchema = z.object({
  entries: z.array(EntrySchema),
  days: z.array(DaySchema),
  outcome: z.enum(["created", "replayed"]),
});

/** What `DELETE /entries/:id` answers. */
export const EntryRemoveResultSchema = z.object({ days: z.array(DaySchema) });

/** What `POST /entries/remove` answers: the entries it removed, in day and position order, and their days. */
export const EntryRemoveManyResultSchema = z.object({ removedIds: z.array(z.uuid()), days: z.array(DaySchema) });

/** What `POST /saved-meals/log` answers. */
export const SaveAndLogResultSchema = z.object({
  meal: SavedMealSchema,
  entry: EntrySchema.nullable(),
  days: z.array(DaySchema),
  outcome: z.enum(["created", "replayed"]),
});

export type EntryWriteResult = z.infer<typeof EntryWriteResultSchema>;
export type EntryStatusResult = z.infer<typeof EntryStatusResultSchema>;
export type CopyEntriesResult = z.infer<typeof CopyEntriesResultSchema>;
export type EntryRemoveResult = z.infer<typeof EntryRemoveResultSchema>;
export type EntryRemoveManyResult = z.infer<typeof EntryRemoveManyResultSchema>;
export type SaveAndLogResult = z.infer<typeof SaveAndLogResultSchema>;
