import type { TargetChange, TargetRanges } from "@hovimestari/types";
import { and, count, eq, getTableColumns, sql } from "drizzle-orm";
import { targetChanges, users } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { targetChangeOf } from "../reads/targets.js";
import { lockUserForWrite } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

/**
 * Saves the targets in force from `effectiveFrom`. A second save on the same
 * date overwrites that change, so a date holds one change at most. Days
 * before `effectiveFrom` keep what they had: an earlier change, or none.
 */
export async function setTargets(
  ctx: WriteContext,
  effectiveFrom: string,
  ranges: TargetRanges,
): Promise<WriteOutcome<TargetChange>> {
  const values = {
    energyKcalLower: ranges.energyKcal.lower,
    energyKcalUpper: ranges.energyKcal.upper,
    proteinGLower: ranges.proteinG.lower,
    proteinGUpper: ranges.proteinG.upper,
  };
  const t = targetChanges;
  const [written] = await ctx.db.transaction(async (tx) => {
    // FOR KEY SHARE, so a save never waits behind a session write, and one
    // that races an account deletion answers 404 `user_not_found`.
    await lockUserForWrite(tx, ctx.userId);
    return tx
      .insert(t)
      .values({ userId: ctx.userId, effectiveFrom, ...values })
      .onConflictDoUpdate({
        target: [t.userId, t.effectiveFrom],
        set: { ...values, updatedAt: ctx.now },
        // An identical save writes nothing and keeps `updated_at`.
        setWhere: sql`(${t.energyKcalLower}, ${t.energyKcalUpper}, ${t.proteinGLower}, ${t.proteinGUpper})
        IS DISTINCT FROM (excluded.energy_kcal_lower, excluded.energy_kcal_upper, excluded.protein_g_lower, excluded.protein_g_upper)`,
      })
      .returning({ ...getTableColumns(t), inserted: sql<boolean>`xmax = 0` });
  });
  if (written) {
    const { inserted, ...row } = written;
    return { value: targetChangeOf(row), outcome: inserted ? "created" : "changed" };
  }
  const [kept] = await ctx.db
    .select()
    .from(t)
    .where(and(eq(t.userId, ctx.userId), eq(t.effectiveFrom, effectiveFrom)));
  // A removal between the save and this read leaves nothing to answer with.
  if (!kept) throw appError("target_change_not_found", 404);
  return { value: targetChangeOf(kept), outcome: "unchanged" };
}

/**
 * Removes the change that starts on `effectiveFrom`. The last remaining
 * change cannot be removed. The user's row is locked first, so two removals
 * at once cannot both find another change left.
 */
export async function removeTargetChange(ctx: WriteContext, effectiveFrom: string): Promise<WriteOutcome<null>> {
  await ctx.db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.userId)).for("no key update");
    const mine = eq(targetChanges.userId, ctx.userId);
    const [target] = await tx
      .select({ id: targetChanges.id })
      .from(targetChanges)
      .where(and(mine, eq(targetChanges.effectiveFrom, effectiveFrom)));
    if (!target) throw appError("target_change_not_found", 404);
    const [{ n }] = await tx.select({ n: count() }).from(targetChanges).where(mine);
    if (n <= 1) throw appError("targets_last_change", 409);
    await tx.delete(targetChanges).where(eq(targetChanges.id, target.id));
  });
  return { value: null, outcome: "deleted" };
}
