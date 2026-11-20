import { z } from "zod";
import { IsoDateSchema } from "./dates.js";
import { EntrySchema, type Entry } from "./entries.js";
import { FiguresSchema, positionOf, RangePositionSchema, totalOf } from "./figures.js";
import { TargetRangesSchema, type TargetRanges } from "./targets.js";

/** The longest range `GET /days` answers, in days. */
export const MAX_DAY_RANGE = 42;

/** One reading of a day: what was eaten, or that plus everything planned. */
export const DayReadingSchema = z.object({
  /** The sum of the rows' rounded figures. */
  figures: FiguresSchema,
  /**
   * Null in two cases. On a day without targets: before the first change, or
   * for a user with none. And on a past day whose reading holds no entries:
   * nothing was recorded, which is not the same as nothing eaten. Today and
   * later days keep a position while empty: what is left to reach the range.
   */
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
/** Where a day falls against the user's today. */
export type DayRelation = DaySummary["relation"];
export type Day = z.infer<typeof DaySchema>;
export type DaySummaryList = z.infer<typeof DaySummaryListSchema>;
export type DayRangeQuery = z.infer<typeof DayRangeQuerySchema>;

/** What a day summary reads of an entry: the fields `summarizeDay` takes of each row. */
export type DayRow = Pick<Entry, "status" | "figures" | "isEstimate">;

/**
 * One reading of `rows`: their total, the sum of their rounded figures, and
 * where it stands against `targets`. A reading with no rows on a past day has
 * no position, since nothing was recorded on it.
 */
function readingFrom(rows: readonly DayRow[], targets: TargetRanges | null, relation: DayRelation): DayReading {
  const figures = totalOf(rows.map((r) => r.figures));
  const placed = relation === "past" && rows.length === 0 ? null : targets;
  return {
    figures,
    energy: placed ? positionOf(figures.energyKcal, placed.energyKcal) : null,
    protein: placed ? positionOf(figures.proteinG, placed.proteinG) : null,
    includesEstimate: rows.some((r) => r.isEstimate),
  };
}

/**
 * A day's summary from its entries, in position order, and the targets in
 * force on it. The one computation: the days service answers every day
 * through it, and the web's test fake builds its days with it.
 *
 * A reading's energy and protein positions are null on a day without
 * targets, and on a past day when the reading holds no entries: nothing was
 * recorded, which is not the same as nothing eaten. On today and later days
 * an empty reading keeps its position: what is left to reach the range.
 */
export function summarizeDay(
  date: string,
  today: string,
  rows: readonly DayRow[],
  targets: TargetRanges | null,
): DaySummary {
  const relation: DayRelation = date < today ? "past" : date === today ? "today" : "future";
  const planned = rows.filter((r) => r.status === "planned").length;
  return {
    date,
    today,
    relation,
    targets,
    eaten: readingFrom(
      rows.filter((r) => r.status === "eaten"),
      targets,
      relation,
    ),
    withPlan: readingFrom(rows, targets, relation),
    entryCount: rows.length,
    plannedCount: planned,
    unmarkedCount: relation === "past" ? planned : 0,
  };
}
