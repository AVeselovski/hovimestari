import {
  RecipeBodySchema,
  RecipeEditBodySchema,
  type IngredientLineDraft,
  type Recipe,
  type RecipeEditBody,
} from "@hovimestari/types";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { recipes } from "../../../db/schema/index.js";
import type { Tx } from "../../../db/types.js";
import { isUuid } from "../../../lib/isUuid.js";
import type { ReadContext } from "../../reads/context.js";
import { getRecipe } from "../../reads/recipes.js";
import { createdChanges, editedChanges } from "../../recipeChanges.js";
import { ownRecipe } from "../../recipeScope.js";
import { goneAsNull, recordedWrite, type AssistantActor, type ChangeRecord, type Replay } from "../changeRecord.js";
import type { WriteContext } from "../context.js";
import { createRecipe, setRecipeArchived, setRecipeFavourite, updateRecipe } from "../recipes.js";

// ---------------------------------------------------------------------------
// The recipe writes an assistant makes (recipes design d.6), one function
// per tool, each through one of the screen's recipe services inside
// `recordedWrite`. A recipe is the person's own: another person's, or one
// deleted, answers recipe_not_found as on screen. Here live the before-reads
// under the lock the service takes, the summaries and the replay reader.
// Nothing here writes a row of its own (screenPath.test.ts pins it).
//
// Every recipe summary is `{ entity: "recipe", name, changes }`, built by
// recipeChanges.ts. A create lists what it set. An edit names only what
// differs: the lines added, removed or changed, the steps added, removed,
// reworded or moved.
// Archiving, restoring and the favourite list none: the action says which.
// The server makes a new recipe's id and the id of every line sent without
// one, and the request key makes a retry land once.
// ---------------------------------------------------------------------------

/** What a draft the assistant sends looks like: a whole recipe whose lines may have no id yet. */
export type RecipeDraft = Omit<RecipeEditBody, "lines"> & {
  lines: IngredientLineDraft[];
};

/** The draft's lines, each with its own id or a new one. */
const withIds = (draft: RecipeDraft) => ({
  ...draft,
  lines: draft.lines.map((line) => ({ ...line, id: line.id ?? randomUUID() })),
});

/**
 * The person's recipe `id`, its row locked FOR UPDATE as the service locks
 * it, as it reads now, or null when it is not theirs: the service then
 * refuses. Archiving and the favourite need the row alone.
 */
async function lockedRow(tx: Tx, ctx: WriteContext, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({ id: recipes.id, name: recipes.name, archivedAt: recipes.archivedAt, favouriteAt: recipes.favouriteAt })
    .from(recipes)
    .where(and(eq(recipes.id, id), ownRecipe(ctx.userId)))
    .for("update");
  return row ?? null;
}

/** The person's recipe `id` whole, locked as `lockedRow` locks it, or null. An edit's record compares it. */
async function lockedRecipe(tx: Tx, ctx: WriteContext, id: string): Promise<Recipe | null> {
  const row = await lockedRow(tx, ctx, id);
  return row ? getRecipe({ ...ctx, db: tx }, row.id) : null;
}

export async function recordedCreateRecipe(ctx: WriteContext, via: AssistantActor, draft: RecipeDraft) {
  const body = RecipeBodySchema.parse({ ...withIds(draft), id: randomUUID() });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: async () => null,
    run: (tx) => createRecipe(tx, body),
    record: (_before, { outcome, value }): ChangeRecord | null => {
      // A fresh id is never taken, so the service's own replay never answers here.
      if (outcome !== "created") return null;
      return {
        action: "recipe.created",
        entityIds: [value.id],
        summary: {
          entity: "recipe",
          name: value.name,
          changes: createdChanges(value),
        },
      };
    },
  });
}

export async function recordedUpdateRecipe(
  ctx: WriteContext,
  via: AssistantActor,
  recipeId: string,
  draft: RecipeDraft,
) {
  const body = RecipeEditBodySchema.parse(withIds(draft));
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedRecipe(tx, c, recipeId),
    run: (tx) => updateRecipe(tx, recipeId, body),
    record: (before, { outcome, value }): ChangeRecord | null => {
      if (!before || outcome !== "changed") return null;
      return {
        action: "recipe.changed",
        entityIds: [value.id],
        summary: { entity: "recipe", name: value.name, changes: editedChanges(before, value) },
      };
    },
  });
}

export async function recordedSetRecipeArchived(
  ctx: WriteContext,
  via: AssistantActor,
  recipeId: string,
  archived: boolean,
) {
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedRow(tx, c, recipeId),
    // The service answers changed even for a recipe already archived or already active.
    run: (tx) => setRecipeArchived(tx, recipeId, archived),
    record: (before): ChangeRecord | null => {
      if (!before || (before.archivedAt !== null) === archived) return null;
      return {
        action: archived ? "recipe.archived" : "recipe.restored",
        entityIds: [before.id],
        summary: { entity: "recipe", name: before.name, changes: [] },
      };
    },
  });
}

export async function recordedSetRecipeFavourite(
  ctx: WriteContext,
  via: AssistantActor,
  recipeId: string,
  favourite: boolean,
) {
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedRow(tx, c, recipeId),
    // The service answers changed even for a recipe already marked or already unmarked.
    run: (tx) => setRecipeFavourite(tx, recipeId, favourite),
    record: (before): ChangeRecord | null => {
      if (!before || (before.favouriteAt !== null) === favourite) return null;
      return {
        action: favourite ? "recipe.favourite_set" : "recipe.favourite_unset",
        entityIds: [before.id],
        summary: { entity: "recipe", name: before.name, changes: [] },
      };
    },
  });
}

/**
 * The recipe the record names, as it is now, or null when it is gone: deleted
 * outright, or deleted on screen and kept hidden because days use it.
 */
export async function replayRecipe(ctx: ReadContext, replay: Replay): Promise<{ recipe: Recipe | null }> {
  const recipe = await goneAsNull("recipe_not_found", getRecipe(ctx, replay.entityIds[0]));
  return { recipe: recipe?.deleted ? null : recipe };
}
