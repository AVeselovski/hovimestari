import {
  daysBetween,
  positionOf,
  totalOf,
  type Day,
  type DayReading,
  type DaySummary,
  type Entry,
  type TargetRanges,
} from "@hovimestari/types";
import { and, eq, gte, lte } from "drizzle-orm";
import { entries } from "../../db/schema/index.js";
import { entryOf, selectEntries } from "../entryRows.js";
import type { ReadContext } from "./context.js";
import { inForceOn, listTargetChanges, targetsOn } from "./targets.js";

// A day is the user's entries on one date. Its two readings, eaten and with
// plan, are each the sum of their rows' rounded figures, so the rows on
// screen always add up to the total. A position compares a total with a
// range in integer tenths (packages/types figures.ts).

/** One reading of `rows`: their total and where it stands against `targets`. */
function readingOf(rows: Entry[], targets: TargetRanges | null): DayReading {
  const figures = totalOf(rows.map((r) => r.figures));
  return {
    figures,
    energy: targets ? positionOf(figures.energyKcal, targets.energyKcal) : null,
    protein: targets ? positionOf(figures.proteinG, targets.proteinG) : null,
    includesEstimate: rows.some((r) => r.isEstimate),
  };
}

/** The summary of `date` from its entries, in position order, and the targets in force on it. */
function summaryOf(ctx: ReadContext, date: string, rows: Entry[], targets: TargetRanges | null): DaySummary {
  const relation = date < ctx.today ? "past" : date === ctx.today ? "today" : "future";
  const planned = rows.filter((r) => r.status === "planned").length;
  return {
    date,
    today: ctx.today,
    relation,
    targets,
    eaten: readingOf(
      rows.filter((r) => r.status === "eaten"),
      targets,
    ),
    withPlan: readingOf(rows, targets),
    entryCount: rows.length,
    plannedCount: planned,
    unmarkedCount: relation === "past" ? planned : 0,
  };
}

/** The user's entry `id` as the API shows it, or null when it is not theirs or not there. */
export async function getEntry(ctx: ReadContext, id: string): Promise<Entry | null> {
  const [row] = await selectEntries(ctx.db, ctx.userId, eq(entries.id, id));
  return row ? entryOf(row) : null;
}

/** One day: its entries in the order added, its two readings, and where each stands against the targets in force. */
export async function getDay(ctx: ReadContext, date: string): Promise<Day> {
  const [inForce, rows] = await Promise.all([
    targetsOn(ctx, date),
    selectEntries(ctx.db, ctx.userId, eq(entries.date, date)),
  ]);
  const list = rows.map(entryOf);
  return { ...summaryOf(ctx, date, list, inForce?.ranges ?? null), entries: list };
}

/** The dates from `from` to `to`, both included. */
function datesOf(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  );
}

/**
 * Every day from `from` to `to` as `getDay` sums it, without the entries.
 * One query for the entries and one for the targets, whatever the range.
 */
export async function listDaySummaries(ctx: ReadContext, range: { from: string; to: string }): Promise<DaySummary[]> {
  const [changes, rows] = await Promise.all([
    listTargetChanges(ctx),
    selectEntries(ctx.db, ctx.userId, and(gte(entries.date, range.from), lte(entries.date, range.to))),
  ]);
  const byDate = new Map<string, Entry[]>();
  for (const row of rows) {
    const entry = entryOf(row);
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  return datesOf(range.from, range.to).map((date) =>
    summaryOf(ctx, date, byDate.get(date) ?? [], inForceOn(changes, date)?.ranges ?? null),
  );
}

/** Each distinct date of `dates` as a day, in date order. */
export async function getDays(ctx: ReadContext, dates: string[]): Promise<Day[]> {
  return Promise.all([...new Set(dates)].sort().map((date) => getDay(ctx, date)));
}
