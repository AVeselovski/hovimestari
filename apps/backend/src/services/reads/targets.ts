import type { TargetChange, TargetsOverview } from "@hovimestari/types";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { targetChanges, users } from "../../db/schema/index.js";
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
 * change, today, and whether the first run is due. `inForce` is null on a
 * date before the first change. The first run is due only while the user has
 * no change and has never passed it. The flag is read by primary key here,
 * since the context carries no user row and the MCP path builds its own.
 */
export async function targetsOverview(ctx: ReadContext, date: string = ctx.today): Promise<TargetsOverview> {
  // "No change and the flag unset" is one statement, so one snapshot. A
  // removal deletes the change and sets the flag in one transaction. Read in
  // two statements, one could see the flag before that commit and the other
  // the changes after it, and answer due to a user who has just passed.
  const [inForce, changes, [user]] = await Promise.all([
    targetsOn(ctx, date),
    listTargetChanges(ctx),
    ctx.db
      .select({
        due: sql<boolean>`${users.firstRunDoneAt} IS NULL AND NOT EXISTS (SELECT 1 FROM ${targetChanges} WHERE ${targetChanges.userId} = ${users.id})`,
      })
      .from(users)
      .where(eq(users.id, ctx.userId)),
  ]);
  // A deleted account reads as passed: no first run is offered to it. The
  // empty list stays in the rule, so a change added between the statements
  // never answers due next to that change.
  const firstRunDue = changes.length === 0 && user !== undefined && user.due;
  return { date, today: ctx.today, inForce, changes, firstRunDue };
}
