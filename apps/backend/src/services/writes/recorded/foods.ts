import {
  OwnFoodBodySchema,
  OwnFoodUpdateBodySchema,
  PortionBodySchema,
  type FoodDetail,
  type OwnFoodBody,
  type Portion,
  type PortionBody,
} from "@hovimestari/types";
import { and, eq, isNull } from "drizzle-orm";
import { foodPortions, foods } from "../../../db/schema/index.js";
import type { Tx } from "../../../db/types.js";
import { isUuid } from "../../../lib/isUuid.js";
import { portionOf } from "../../foodRows.js";
import type { ReadContext } from "../../reads/context.js";
import { getFood, portionsOf } from "../../reads/foods.js";
import {
  fieldChanges,
  goneAsNull,
  recordedWrite,
  type AssistantActor,
  type ChangeRecord,
  type Replay,
} from "../changeRecord.js";
import type { WriteContext } from "../context.js";
import { addPortion, createOwnFood, setFavourite, updateOwnFood, updatePortion } from "../foods.js";

// ---------------------------------------------------------------------------
// The food writes an assistant makes (design d.4), one function per tool,
// each through one of the screen's food services inside `recordedWrite`.
// The services keep their own scope: an own food is the only food an edit
// reaches (a shared one answers 403 food_read_only), and a portion or a
// favourite may go on any food the person can see, as on screen. Here live
// the before-reads under a lock, the summaries and the replay readers.
// Nothing here writes a row of its own (screenPath.test.ts pins it).
//
// Every food summary is `{ entity: "food", name, changes }`, `name` being the
// food's name as the person reads it. A create lists the values it set, each
// from null. A portion's changes name the portion's own `name` and `grams`.
// A favourite lists none: its action says which way it went.
// ---------------------------------------------------------------------------

/** The person's food `id` as they read it, from the transaction. */
const foodOn = (tx: Tx, ctx: WriteContext, id: string) => getFood({ ...ctx, db: tx }, id);

/**
 * The person's own food `id`, locked FOR NO KEY UPDATE, as the edit will
 * read it, or null when it is not theirs to edit: the service then refuses.
 */
async function lockedOwnFood(tx: Tx, ctx: WriteContext, id: string): Promise<FoodDetail | null> {
  if (!isUuid(id)) return null;
  const [own] = await tx
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.source, "user"), eq(foods.userId, ctx.userId), isNull(foods.deletedAt)))
    .for("no key update");
  return own ? foodOn(tx, ctx, id) : null;
}

/** The values a food summary compares. */
const valuesOf = (food: FoodDetail) => ({ name: food.name, per100g: food.per100g, barcode: food.barcode });

export async function recordedCreateOwnFood(ctx: WriteContext, via: AssistantActor, args: OwnFoodBody) {
  const body = OwnFoodBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: async () => null,
    run: (tx) => createOwnFood(tx, body),
    record: (_before, { outcome, value }): ChangeRecord | null => {
      if (outcome !== "created") return null;
      return {
        action: "food.created",
        entityIds: [value.id],
        summary: {
          entity: "food",
          name: value.name,
          changes: fieldChanges([
            ["per100g", null, value.per100g],
            ["barcode", null, value.barcode],
          ]),
        },
      };
    },
  });
}

export async function recordedUpdateOwnFood(ctx: WriteContext, via: AssistantActor, foodId: string, args: OwnFoodBody) {
  const body = OwnFoodUpdateBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedOwnFood(tx, c, foodId),
    run: (tx) => updateOwnFood(tx, foodId, body),
    record: (before, { value }): ChangeRecord | null => {
      if (!before) return null;
      const [from, to] = [valuesOf(before), valuesOf(value)];
      const changes = fieldChanges([
        ["name", from.name, to.name],
        ["per100g", from.per100g, to.per100g],
        ["barcode", from.barcode, to.barcode],
      ]);
      if (changes.length === 0) return null;
      return { action: "food.changed", entityIds: [value.id], summary: { entity: "food", name: value.name, changes } };
    },
  });
}

export async function recordedAddPortion(ctx: WriteContext, via: AssistantActor, foodId: string, args: PortionBody) {
  const body = PortionBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    // The food's name for the record. A food the person cannot see refuses as the service would.
    before: async (tx, c) => (await foodOn(tx, c, foodId)).name,
    run: (tx) => addPortion(tx, foodId, body),
    record: (foodName, { outcome, value }): ChangeRecord | null => {
      if (outcome !== "created") return null;
      return {
        action: "portion.added",
        entityIds: [foodId, value.id],
        summary: {
          entity: "food",
          name: foodName,
          changes: fieldChanges([
            ["name", null, value.name],
            ["grams", null, value.grams],
          ]),
        },
      };
    },
  });
}

/**
 * The person's own portion `portionId` of food `foodId`, locked FOR NO KEY
 * UPDATE, with the food's name, or null: the service then refuses.
 */
async function lockedOwnPortion(tx: Tx, ctx: WriteContext, foodId: string, portionId: string) {
  if (!isUuid(foodId) || !isUuid(portionId)) return null;
  const [row] = await tx
    .select()
    .from(foodPortions)
    .where(and(eq(foodPortions.id, portionId), eq(foodPortions.foodId, foodId), eq(foodPortions.userId, ctx.userId)))
    .for("no key update");
  if (!row) return null;
  const food = await goneAsNull("food_not_found", foodOn(tx, ctx, foodId));
  return food ? { portion: portionOf(row, ctx.userId), foodName: food.name } : null;
}

export async function recordedUpdatePortion(
  ctx: WriteContext,
  via: AssistantActor,
  foodId: string,
  portionId: string,
  args: PortionBody,
) {
  const body = PortionBodySchema.parse(args);
  return recordedWrite(ctx, via, {
    userLock: "key share",
    before: (tx, c) => lockedOwnPortion(tx, c, foodId, portionId),
    run: (tx) => updatePortion(tx, foodId, portionId, body),
    record: (before, { value }): ChangeRecord | null => {
      if (!before) return null;
      const changes = fieldChanges([
        ["name", before.portion.name, value.name],
        ["grams", before.portion.grams, value.grams],
      ]);
      if (changes.length === 0) return null;
      return {
        action: "portion.changed",
        entityIds: [foodId, value.id],
        // The portion's name after the change, so a change of grams alone still says which portion.
        summary: { entity: "food", name: before.foodName, portion: value.name ?? undefined, changes },
      };
    },
  });
}

export async function recordedSetFavourite(ctx: WriteContext, via: AssistantActor, foodId: string, favourite: boolean) {
  return recordedWrite(ctx, via, {
    userLock: "key share",
    // The food's name for the record. A food the person cannot see refuses as the service would.
    before: async (tx, c) => (await foodOn(tx, c, foodId)).name,
    run: (tx) => setFavourite(tx, foodId, favourite),
    record: (foodName, { outcome }): ChangeRecord | null => {
      // The service answers unchanged for a favourite already set or already gone.
      if (outcome !== "created" && outcome !== "deleted") return null;
      return {
        action: outcome === "created" ? "favourite.set" : "favourite.unset",
        entityIds: [foodId],
        summary: { entity: "food", name: foodName, changes: [] },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Replays: the food or the portion as it is now, read by the record's ids.
// A food deleted or hidden on screen since reads as null, as GET /foods/:id
// refuses it.
// ---------------------------------------------------------------------------

/** The food the record names, as it is now, or null when it is gone. */
export async function replayFood(ctx: ReadContext, replay: Replay): Promise<{ food: FoodDetail | null }> {
  return { food: await goneAsNull("food_not_found", getFood(ctx, replay.entityIds[0])) };
}

/** The portion the record names, as it is now, or null when it or its food is gone. */
export async function replayPortion(ctx: ReadContext, replay: Replay): Promise<{ portion: Portion | null }> {
  const [foodId, portionId] = replay.entityIds;
  const portions = await portionsOf(ctx, foodId);
  return { portion: portions.find((portion) => portion.id === portionId) ?? null };
}
