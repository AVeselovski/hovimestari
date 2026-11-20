import {
  CookAsRecipeBodySchema,
  CookBodySchema,
  type Cook,
  type CookLineDraft,
  type Day,
  type Entry,
  type EntryStatus,
  type Recipe,
} from "@hovimestari/types";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cooks, recipes } from "../../../db/schema/index.js";
import type { Tx } from "../../../db/types.js";
import { isUuid } from "../../../lib/isUuid.js";
import { parseBody } from "../../../lib/parseBody.js";
import type { ReadContext } from "../../reads/context.js";
import { getCook } from "../../reads/cooks.js";
import { getDays, getEntry } from "../../reads/days.js";
import { getRecipe } from "../../reads/recipes.js";
import { cookChanges, createdChanges } from "../../recipeChanges.js";
import { ownRecipe } from "../../recipeScope.js";
import { goneAsNull, recordedWrite, type AssistantActor, type ChangeRecord, type Replay } from "../changeRecord.js";
import type { WriteContext } from "../context.js";
import { createCook, saveCookAsRecipe } from "../cooks.js";
import { lineOf } from "./entries.js";

// ---------------------------------------------------------------------------
// The cook writes an assistant makes (recipes design d.6), each through the
// service its REST route calls, inside `recordedWrite`. The app makes the
// cook's id, every line's id and every new entry's id, and the request key
// makes a retry land once. Here live the before-read of the recipe under the
// lock the service takes, the summary and the replay reader. Nothing here
// writes a row of its own (screenPath.test.ts pins it).
//
// A cook's record names the batch, what it changed from its recipe as the
// recipe was then (recipeChanges.ts), and the entries it fed. Its ids are
// the cook's, then each entry it attached or added, in date and position
// order, each saying whether the batch attached it or added it. Saving a
// cook as a recipe records `recipe.created`, with the batch it came from.
// ---------------------------------------------------------------------------

/** What `log_cook` takes: a batch whose lines and new entries have no id yet. */
export interface LogCookArgs {
  recipeId: string;
  date: string;
  servings: number;
  lines: CookLineDraft[];
  attach: string[];
  attachStatus: { id: string; status: EntryStatus }[];
  add: { date: string; status: EntryStatus; servings: number }[];
}

/** The person's recipe `id` as it reads now, its row held FOR SHARE as the service holds it, or null. */
async function sharedRecipe(tx: Tx, ctx: WriteContext, id: string): Promise<Recipe | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, id), ownRecipe(ctx.userId)))
    .for("share");
  return row ? getRecipe({ ...ctx, db: tx }, row.id) : null;
}

/** The batch `id` the person saves as a recipe: its recipe's name and the day it was made, its row held FOR SHARE as the service holds it, or null. */
async function sharedCook(tx: Tx, ctx: WriteContext, id: string): Promise<{ recipeName: string; date: string } | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx
    .select({ recipeName: recipes.name, date: cooks.date })
    .from(cooks)
    .innerJoin(recipes, eq(recipes.id, cooks.recipeId))
    .where(and(eq(cooks.id, id), eq(cooks.userId, ctx.userId)))
    .for("share", { of: cooks });
  return row ?? null;
}

export async function recordedLogCook(ctx: WriteContext, via: AssistantActor, args: LogCookArgs) {
  // Through parseBody, so a refusal of the body answers its own code as the route does.
  const body = parseBody(CookBodySchema, {
    ...args,
    id: randomUUID(),
    lines: args.lines.map((line) => ({ ...line, id: line.id ?? randomUUID() })),
    add: args.add.map((add) => ({ ...add, id: randomUUID() })),
  });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => sharedRecipe(tx, c, body.recipeId),
    run: (tx) => createCook(tx, body),
    record: (recipe, { outcome, value }): ChangeRecord | null => {
      // A fresh id is never taken, so the service's own replay never answers here.
      if (!recipe || outcome !== "created") return null;
      const attached = new Set(body.attach.map((id) => id.toLowerCase()));
      return {
        action: "cook.logged",
        entityIds: [value.cook.id, ...value.entries.map((e) => e.id)],
        summary: {
          entity: "cook",
          recipeName: recipe.name,
          date: value.cook.date,
          servings: value.cook.servings,
          ...cookChanges(recipe, value.cook),
          entries: value.entries.map((e) => ({ ...lineOf(e), attached: attached.has(e.id) })),
        },
      };
    },
  });
}

export async function recordedSaveCookAsRecipe(ctx: WriteContext, via: AssistantActor, cookId: string, name: string) {
  const body = parseBody(CookAsRecipeBodySchema, { id: randomUUID(), name });
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => sharedCook(tx, c, cookId),
    run: (tx) => saveCookAsRecipe(tx, cookId, body),
    record: (cook, { outcome, value }): ChangeRecord | null => {
      if (outcome !== "created") return null;
      return {
        action: "recipe.created",
        entityIds: [value.id],
        summary: {
          entity: "recipe",
          name: value.name,
          changes: createdChanges(value),
          ...(cook ? { fromCook: cook } : {}),
        },
      };
    },
  });
}

/**
 * The cook the record names as it is now, or null when it is gone, the
 * entries it fed that are still there, and their days now, with the
 * recorded days of the ones gone.
 */
export async function replayCook(
  ctx: ReadContext,
  replay: Replay,
): Promise<{ cook: Cook | null; entries: Entry[]; days: Day[] }> {
  const [cookId, ...entryIds] = replay.entityIds;
  const cook = await goneAsNull("cook_not_found", getCook(ctx, cookId!));
  const found = await Promise.all(entryIds.map((id) => getEntry(ctx, id)));
  const entries = found.filter((e): e is Entry => e !== null);
  const recorded = replay.summary.entity === "cook" ? replay.summary.entries.map((e) => e.date) : [];
  return { cook, entries, days: await getDays(ctx, [...entries.map((e) => e.date), ...recorded]) };
}
