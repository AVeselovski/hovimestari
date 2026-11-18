import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { EntrySchema } from "./entries.js";
import { FiguresSchema, RangePositionSchema } from "./figures.js";
import { TargetRangesSchema } from "./targets.js";

/** The longest range `GET /days` answers, in days. */
export const MAX_DAY_RANGE = 42;

/** One reading of a day: what was eaten, or that plus everything planned. */
export const DayReadingSchema = z.object({
  /** The sum of the rows' rounded figures. */
  figures: FiguresSchema,
  /** Null on a day without targets: before the first change, or for a user with none. */
  energy: RangePositionSchema.nullable(),
  protein: RangePositionSchema.nullable(),
  includesEstimate: z.boolean(),
});

export const DaySummarySchema = z.object({
  date: IsoDateSchema,
  /** The user's today, in their time zone. */
  today: IsoDateSchema,
  relation: z.enum(["past", "today", "future"]),
  /** The targets in force on the date. Null on a day without targets: before the first change, or for a user with none. */
  targets: TargetRangesSchema.nullable(),
  eaten: DayReadingSchema,
  withPlan: DayReadingSchema,
  entryCount: z.number().int(),
  plannedCount: z.number().int(),
  /** Planned entries on a past day: never marked eaten. 0 on today and future days. */
  unmarkedCount: z.number().int(),
});

export const DaySchema = DaySummarySchema.extend({ entries: z.array(EntrySchema) });
export const DaySummaryListSchema = z.object({ days: z.array(DaySummarySchema) });

/** `GET /days/:date`: a date, or `today` for the user's today. */
export const DayParamSchema = z.union([z.literal("today"), IsoDateSchema], { error: "invalid_date" });

/** `GET /days?from=&to=`: `from` on or before `to`, at most 42 days. */
export const DayRangeQuerySchema = z
  .object({ from: IsoDateSchema, to: IsoDateSchema })
  .refine((q) => q.from <= q.to && daysBetween(q.from, q.to) < MAX_DAY_RANGE, { error: "invalid_request" });

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type DayReading = z.infer<typeof DayReadingSchema>;
export type DaySummary = z.infer<typeof DaySummarySchema>;
export type Day = z.infer<typeof DaySchema>;
export type DaySummaryList = z.infer<typeof DaySummaryListSchema>;
export type DayRangeQuery = z.infer<typeof DayRangeQuerySchema>;
