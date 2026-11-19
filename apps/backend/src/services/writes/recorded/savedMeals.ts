import {
  SavedMealBodySchema,
  SavedMealEditBodySchema,
  type SavedMeal,
  type SavedMealEditBody,
} from "@hovimestari/types";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { savedMeals } from "../../../db/schema/index.js";
import type { Tx } from "../../../db/types.js";
import { isUuid } from "../../../lib/isUuid.js";
import type { ReadContext } from "../../reads/context.js";
import { getSavedMeal, ownMeal, savedMealOf } from "../../reads/savedMeals.js";
import {
  fieldChanges,
  goneAsNull,
  recordedWrite,
  type AssistantActor,
  type ChangeRecord,
  type Replay,
} from "../changeRecord.js";
import type { WriteContext } from "../context.js";
import { createSavedMeal, setSavedMealArchived, updateSavedMeal } from "../savedMeals.js";

// ---------------------------------------------------------------------------
// The saved-meal writes an assistant makes (design d.4), one function per
// tool, each through one of the screen's saved-meal services inside
// `recordedWrite`. A meal is the person's own: another person's, or one
// deleted, answers saved_meal_not_found as on screen. Here live the
// before-reads under the lock the service takes, the summaries and the replay
// reader. Nothing here writes a row of its own (screenPath.test.ts pins it).
//
// Every meal summary is `{ entity: "saved_meal", name, changes }`. A create
// lists the values it set, each from null. Archiving and restoring list none:
// the action says which. The server makes a new meal's id with randomUUID,
// and the request key makes a retry land once.
// ---------------------------------------------------------------------------

/**
 * The person's meal `id`, locked FOR UPDATE as the service locks it, or null
 * when it is not theirs: the service then refuses.
 */
async function lockedMeal(tx: Tx, ctx: WriteContext, id: string): Promise<SavedMeal | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select()
    .from(savedMeals)
    .where(and(eq(savedMeals.id, id), ownMeal(ctx.userId)))
    .for("update");
  return row ? savedMealOf(row, null) : null;
}

export async function recordedCreateSavedMeal(ctx: WriteContext, via: AssistantActor, args: SavedMealEditBody) {
  const body = SavedMealBodySchema.parse({ ...args, id: randomUUID() });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: async () => null,
    run: (tx) => createSavedMeal(tx, body),
    record: (_before, { outcome, value }): ChangeRecord | null => {
      // A fresh id is never taken, so the service's own replay never answers here.
      if (outcome !== "created") return null;
      return {
        action: "saved_meal.created",
        entityIds: [value.id],
        summary: {
          entity: "saved_meal",
          name: value.name,
          changes: fieldChanges([
            ["source", null, value.source],
            ["figures", null, value.figures],
          ]),
        },
      };
    },
  });
}

export async function recordedUpdateSavedMeal(
  ctx: WriteContext,
  via: AssistantActor,
  savedMealId: string,
  args: SavedMealEditBody,
) {
  const body = SavedMealEditBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedMeal(tx, c, savedMealId),
    // The service answers changed for any edit, so the record decides.
    run: (tx) => updateSavedMeal(tx, savedMealId, body),
    record: (before, { value }): ChangeRecord | null => {
      if (!before) return null;
      const changes = fieldChanges([
        ["name", before.name, value.name],
        ["source", before.source, value.source],
        ["figures", before.figures, value.figures],
      ]);
      if (changes.length === 0) return null;
      return {
        action: "saved_meal.changed",
        entityIds: [value.id],
        summary: { entity: "saved_meal", name: value.name, changes },
      };
    },
  });
}

export async function recordedSetSavedMealArchived(
  ctx: WriteContext,
  via: AssistantActor,
  savedMealId: string,
  archived: boolean,
) {
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedMeal(tx, c, savedMealId),
    // The service answers changed even for a meal already archived or already active.
    run: (tx) => setSavedMealArchived(tx, savedMealId, archived),
    record: (before): ChangeRecord | null => {
      if (!before || before.archived === archived) return null;
      return {
        action: archived ? "saved_meal.archived" : "saved_meal.restored",
        entityIds: [before.id],
        summary: { entity: "saved_meal", name: before.name, changes: [] },
      };
    },
  });
}

/** The meal the record names, as it is now, archived or not, or null when it is deleted. */
export async function replayMeal(ctx: ReadContext, replay: Replay): Promise<{ meal: SavedMeal | null }> {
  return { meal: await goneAsNull("saved_meal_not_found", getSavedMeal(ctx, replay.entityIds[0])) };
}
