import type { TargetChange, TargetsOverview } from "@hovimestari/types";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { targetChanges } from "../../db/schema/index.js";
import type { ReadContext } from "./context.js";

type TargetChangeRow = typeof targetChanges.$inferSelect;

/** A stored change as the API shows it. */
export const targetChangeOf = (row: TargetChangeRow): TargetChange => ({
  effectiveFrom: row.effectiveFrom,
  ranges: {
    energyKcal: { lower: row.energyKcalLower, upper: row.energyKcalUpper },
    proteinG: { lower: row.proteinGLower, upper: row.proteinGUpper },
  },
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * The targets in force on `date`: the change with the latest start on or
 * before it. A change applies from its own date until the next one starts,
 * so a date before the first change, and every date of a user with no
 * changes, has none: null.
 */
export async function targetsOn(ctx: ReadContext, date: string): Promise<TargetChange | null> {
  const [latest] = await ctx.db
    .select()
    .from(targetChanges)
    .where(and(eq(targetChanges.userId, ctx.userId), lte(targetChanges.effectiveFrom, date)))
    .orderBy(desc(targetChanges.effectiveFrom))
    .limit(1);
  return latest ? targetChangeOf(latest) : null;
}

/**
 * The rule of `targetsOn` without the database: of `changesAsc`, oldest
 * first, the change with the latest start on or before `date`, else null.
 * The week reads every change once and asks this per date.
 */
export function inForceOn(changesAsc: TargetChange[], date: string): TargetChange | null {
  let inForce: TargetChange | null = null;
  for (const change of changesAsc) {
    if (change.effectiveFrom > date) break;
    inForce = change;
  }
  return inForce;
}

/** Every change of the user, oldest first. */
export async function listTargetChanges(ctx: ReadContext): Promise<TargetChange[]> {
  const rows = await ctx.db
    .select()
    .from(targetChanges)
    .where(eq(targetChanges.userId, ctx.userId))
    .orderBy(asc(targetChanges.effectiveFrom));
  return rows.map(targetChangeOf);
}

/**
 * The targets in force on `date` (the user's today when absent), every
 * change, and today. `inForce` is null on a date before the first change.
 */
export async function targetsOverview(ctx: ReadContext, date: string = ctx.today): Promise<TargetsOverview> {
  const [inForce, changes] = await Promise.all([targetsOn(ctx, date), listTargetChanges(ctx)]);
  return { date, today: ctx.today, inForce, changes };
}
