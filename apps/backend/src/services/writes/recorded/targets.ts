import { SetTargetsBodySchema, type TargetRanges, type TargetsOverview } from "@hovimestari/types";
import { and, eq } from "drizzle-orm";
import { targetChanges } from "../../../db/schema/index.js";
import type { Tx } from "../../../db/types.js";
import type { ReadContext } from "../../reads/context.js";
import { targetChangeOf, targetsOverview } from "../../reads/targets.js";
import { recordedWrite, type AssistantActor, type ChangeRecord, type Replay } from "../changeRecord.js";
import type { WriteContext } from "../context.js";
import { removeTargetChange, setTargets } from "../targets.js";

// ---------------------------------------------------------------------------
// The targets writes an assistant makes (design d.4), each through the
// screen's own targets service inside `recordedWrite`. The numbers are the
// person's, passed as given: the service's own refusals are the only ones,
// and nothing here judges a value. The summary is
// `{ entity: "targets", effectiveFrom, before, after }`, the ranges the
// change replaced or removed and the ranges it set, null for none.
//
// A targets change on a date with none yet has no row to lock, and the
// screen's save takes the user's row only FOR KEY SHARE. So set_targets
// takes the user's row FOR UPDATE first, and reads before and writes under
// that one lock: a screen save on any date waits until it commits, and the
// record's `before` is exactly what it replaced. remove_targets takes the
// user's row FOR NO KEY UPDATE, the lock its service takes first, so no lock
// is ever upgraded, and locks the change's row before reading it.
// ---------------------------------------------------------------------------

/** The person's targets change on `effectiveFrom`, with its row id, or null. */
async function changeOn(tx: Tx, ctx: WriteContext, effectiveFrom: string, lock: boolean) {
  const query = tx
    .select()
    .from(targetChanges)
    .where(and(eq(targetChanges.userId, ctx.userId), eq(targetChanges.effectiveFrom, effectiveFrom)));
  const [row] = lock ? await query.for("update") : await query;
  return row ? { id: row.id, change: targetChangeOf(row) } : null;
}

/**
 * `set_targets`: the screen's `setTargets` under the user's row `FOR UPDATE`,
 * recorded with the ranges it replaced. The answer's `targets` are read after
 * the commit on purpose, as a replay reads them: they are the targets as they
 * are now, which a screen save landing just after may already have changed.
 */
export async function recordedSetTargets(
  ctx: WriteContext,
  via: AssistantActor,
  args: { effectiveFrom: string; ranges: TargetRanges },
) {
  const { ranges } = SetTargetsBodySchema.parse({ ranges: args.ranges });
  const { effectiveFrom } = args;
  const { outcome, value } = await recordedWrite(ctx, via, {
    userLock: "update",
    before: async (tx, c) => (await changeOn(tx, c, effectiveFrom, false))?.change ?? null,
    run: async (tx) => {
      const { id, ...result } = await setTargets(tx, effectiveFrom, ranges);
      return { ...result, value: { id, change: result.value } };
    },
    record: (before, { outcome: done, value: written }): ChangeRecord | null => {
      // An identical save writes nothing, and the service says so.
      if (done === "unchanged") return null;
      return {
        action: "targets.set",
        entityIds: [written.id],
        summary: { entity: "targets", effectiveFrom, before: before?.ranges ?? null, after: written.change.ranges },
      };
    },
  });
  // The change as saved, and the targets after it, read once the change has committed.
  return { outcome, value: { change: value.change, targets: await targetsOverview(ctx) } };
}

export async function recordedRemoveTargets(ctx: WriteContext, via: AssistantActor, effectiveFrom: string) {
  const { outcome } = await recordedWrite(ctx, via, {
    userLock: "no key update",
    // Locked, so a screen save on this date waits, and the record names what the removal took.
    before: (tx, c) => changeOn(tx, c, effectiveFrom, true),
    run: (tx) => removeTargetChange(tx, effectiveFrom),
    record: (before): ChangeRecord | null => {
      if (!before) return null;
      return {
        action: "targets.removed",
        entityIds: [before.id],
        summary: { entity: "targets", effectiveFrom, before: before.change.ranges, after: null },
      };
    },
  });
  return { outcome, value: { targets: await targetsOverview(ctx) } };
}

/** The targets as they are now: every change, and the one in force today. */
export async function replayTargets(ctx: ReadContext, _replay: Replay): Promise<{ targets: TargetsOverview }> {
  return { targets: await targetsOverview(ctx) };
}
