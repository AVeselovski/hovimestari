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
 * before it. Before the first change, the first change. Null only for a user
 * with no targets.
 */
export async function targetsOn(ctx: ReadContext, date: string): Promise<TargetChange | null> {
  const [latest] = await ctx.db
    .select()
    .from(targetChanges)
    .where(and(eq(targetChanges.userId, ctx.userId), lte(targetChanges.effectiveFrom, date)))
    .orderBy(desc(targetChanges.effectiveFrom))
    .limit(1);
  if (latest) return targetChangeOf(latest);
  const [first] = await ctx.db
    .select()
    .from(targetChanges)
    .where(eq(targetChanges.userId, ctx.userId))
    .orderBy(asc(targetChanges.effectiveFrom))
    .limit(1);
  return first ? targetChangeOf(first) : null;
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

/** The targets in force on `date` (the user's today when absent), every change, and today. */
export async function targetsOverview(ctx: ReadContext, date: string = ctx.today): Promise<TargetsOverview> {
  const [inForce, changes] = await Promise.all([targetsOn(ctx, date), listTargetChanges(ctx)]);
  return { date, today: ctx.today, inForce, changes };
}
