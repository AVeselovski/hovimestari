import {
  isWellFormedBarcode,
  sameBarcode,
  type FoodDetail,
  type OwnFoodBody,
  type Portion,
  type PortionBody,
} from "@hovimestari/types";
import { and, eq, isNull } from "drizzle-orm";
import { foodFavourites, foodPortions, foods } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { isUniqueViolation } from "../../lib/pgErrors.js";
import { portionOf } from "../foodRows.js";
import { portionVisibleTo, visibleFood } from "../foodScope.js";
import { searchWords } from "../foodSearch.js";
import { getFood } from "../reads/foods.js";
import { isUsed, lockUserForWrite, restoreCutoff, rewritePlannedBasis } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// A user can point only at what they can see: every write first finds the
// food through `visibleTo`, and every portion write the portion through
// `portionVisibleTo` too. Another user's own food or portion is a 404, never
// a 403, so a response never tells that it exists. Every UPDATE and DELETE
// also names the owner in its own WHERE, and no row changed is a 404: the
// earlier read decides the answer's code, the write never trusts it. Every
// insert takes the user's row first (lockUserForWrite), so a write that races
// an account deletion answers 404 `user_not_found`, never a foreign key 500.

type FoodRow = typeof foods.$inferSelect;

/** A food the user can see, or 404 `food_not_found`. */
async function findVisibleFood(ctx: WriteContext, id: string): Promise<FoodRow> {
  if (!isUuid(id)) throw appError("food_not_found", 404);
  const [food] = await ctx.db.select().from(foods).where(visibleFood(ctx.userId, id));
  if (!food) throw appError("food_not_found", 404);
  return food;
}

/** The user's own food with `id`. A shared food answers 403 `food_read_only`. */
async function findOwnFood(ctx: WriteContext, id: string): Promise<FoodRow> {
  const food = await findVisibleFood(ctx, id);
  if (food.source !== "user") throw appError("food_read_only", 403);
  return food;
}

/** The user's own food `id`, not deleted, as a WHERE. */
const ownFood = (ctx: WriteContext, id: string) =>
  and(eq(foods.id, id), eq(foods.source, "user"), eq(foods.userId, ctx.userId), isNull(foods.deletedAt));

/** The user's own portion `id`, as a WHERE. */
const ownPortion = (ctx: WriteContext, id: string) => and(eq(foodPortions.id, id), eq(foodPortions.userId, ctx.userId));

const columnsOf = (body: OwnFoodBody) => ({
  name: body.name,
  energyKcal: body.per100g.energyKcal,
  proteinG: body.per100g.proteinG,
  carbsG: body.per100g.carbsG,
  fatG: body.per100g.fatG,
  barcode: body.barcode,
});

/**
 * Refuses a name search could never find: one with no word of two letters or
 * digits once the search has normalised it. The search's own SQL decides,
 * so this holds whatever the shared schema's approximation lets through.
 */
async function requireSearchable(ctx: WriteContext, name: string): Promise<void> {
  if ((await searchWords(ctx.db, name)).length === 0) throw appError("food_name_not_searchable", 400);
}

/** Runs `write`, turning a second own food with one barcode into 409 `barcode_taken`. */
async function barcodeChecked<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err, "foods_user_barcode_uq")) throw appError("barcode_taken", 409);
    throw err;
  }
}

export async function createOwnFood(ctx: WriteContext, body: OwnFoodBody): Promise<WriteOutcome<FoodDetail>> {
  await requireSearchable(ctx, body.name);
  const [created] = await barcodeChecked(() =>
    ctx.db.transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      return tx
        .insert(foods)
        .values({ source: "user", userId: ctx.userId, ...columnsOf(body) })
        .returning({ id: foods.id });
    }),
  );
  return { value: await getFood(ctx, created.id), outcome: "created" };
}

/**
 * Edits the user's own food, then, in the same transaction, rewrites the
 * basis of its planned entries dated today or later. Eaten entries and every
 * past day keep the values they were added with. The food's row lock waits
 * for an add that holds the food FOR SHARE, and the rewrite, a later
 * statement, then sees that add's entry.
 */
export async function updateOwnFood(
  ctx: WriteContext,
  id: string,
  body: OwnFoodBody,
): Promise<WriteOutcome<FoodDetail>> {
  const food = await findOwnFood(ctx, id);
  // Only a changed name is checked for search, so an edit of a food's values
  // never fails on the name it already has: one saved before the rule, or one
  // the shared schema's approximation let through on create. PUT /foods/:id
  // parses with OwnFoodUpdateBodySchema, which has no search rule, so this is
  // the one check on an edit, for REST and for any later assistant tool that
  // calls this service.
  if (body.name !== food.name) await requireSearchable(ctx, body.name);
  // The same for the barcode: only a new or changed one must have digits a
  // barcode can have, so an edit of a food's values never fails on a barcode
  // it already holds. 12, 13 and 14-digit forms of one code are one barcode.
  const { barcode } = body;
  const barcodeChanged = barcode !== null && !sameBarcode(barcode, food.barcode);
  if (barcodeChanged && !isWellFormedBarcode(barcode)) throw appError("barcode_wrong_digits", 400);
  const next = columnsOf(body);
  const same = (Object.keys(next) as (keyof typeof next)[]).every((k) => food[k] === next[k]);
  if (!same) {
    await barcodeChecked(() =>
      ctx.db.transaction(async (tx) => {
        await lockUserForWrite(tx, ctx.userId);
        // The values before the edit, under the lock the update takes anyway,
        // so the rewrite can tell an edit that raises a recipe's serving.
        const [before] = await tx
          .select({ energyKcal: foods.energyKcal, proteinG: foods.proteinG, carbsG: foods.carbsG, fatG: foods.fatG })
          .from(foods)
          .where(ownFood(ctx, food.id))
          .for("no key update");
        if (!before) throw appError("food_not_found", 404);
        await tx
          .update(foods)
          .set({ ...next, updatedAt: ctx.now })
          .where(ownFood(ctx, food.id));
        await rewritePlannedBasis(tx, ctx, { kind: "food", id: food.id, before });
      }),
    );
  }
  return { value: await getFood(ctx, food.id), outcome: same ? "unchanged" : "changed" };
}

/**
 * Deletes the user's own food, and with it its portions and favourites. A
 * food that entries use, or that an entry removed in the last ten minutes
 * used, is hidden instead: every day keeps its rows and figures, its barcode
 * is cleared and it leaves the favourites. The row lock (FOR UPDATE) waits
 * for an add that holds the food, and the use check, a new statement, then
 * sees it, so the delete never cascades away an entry added a moment earlier.
 */
export async function deleteOwnFood(ctx: WriteContext, id: string): Promise<WriteOutcome<null>> {
  const food = await findOwnFood(ctx, id);
  await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    const [locked] = await tx.select({ id: foods.id }).from(foods).where(ownFood(ctx, food.id)).for("update");
    if (!locked) throw appError("food_not_found", 404);
    if (!(await isUsed(tx, ctx, { kind: "food", id: food.id }, restoreCutoff(ctx)))) {
      await tx.delete(foods).where(ownFood(ctx, food.id));
      return;
    }
    await tx.update(foods).set({ deletedAt: ctx.now, barcode: null, updatedAt: ctx.now }).where(ownFood(ctx, food.id));
    await tx.delete(foodFavourites).where(eq(foodFavourites.foodId, food.id));
  });
  return { value: null, outcome: "deleted" };
}

/** Adds the user's own portion to any food they can see. Only that user sees it. */
export async function addPortion(ctx: WriteContext, foodId: string, body: PortionBody): Promise<WriteOutcome<Portion>> {
  const food = await findVisibleFood(ctx, foodId);
  const [row] = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    return tx
      .insert(foodPortions)
      .values({ foodId: food.id, userId: ctx.userId, name: body.name, grams: body.grams })
      .returning();
  });
  return { value: portionOf(row, ctx.userId), outcome: "created" };
}

/**
 * The user's own portion `portionId` of food `foodId`. Unknown, another
 * user's, or on a food the user cannot see: 404 `portion_not_found`. A
 * portion that comes with the food's source: 403 `portion_read_only`.
 */
async function findOwnPortion(ctx: WriteContext, foodId: string, portionId: string) {
  if (!isUuid(foodId) || !isUuid(portionId)) throw appError("portion_not_found", 404);
  const [found] = await ctx.db
    .select({ portion: foodPortions })
    .from(foodPortions)
    .innerJoin(foods, eq(foods.id, foodPortions.foodId))
    .where(and(eq(foodPortions.id, portionId), visibleFood(ctx.userId, foodId), portionVisibleTo(ctx.userId)));
  if (!found) throw appError("portion_not_found", 404);
  if (found.portion.userId === null) throw appError("portion_read_only", 403);
  return found.portion;
}

export async function updatePortion(
  ctx: WriteContext,
  foodId: string,
  portionId: string,
  body: PortionBody,
): Promise<WriteOutcome<Portion>> {
  const portion = await findOwnPortion(ctx, foodId, portionId);
  if (portion.name === body.name && portion.grams === body.grams) {
    return { value: portionOf(portion, ctx.userId), outcome: "unchanged" };
  }
  const [row] = await ctx.db
    .update(foodPortions)
    .set({ name: body.name, grams: body.grams, updatedAt: ctx.now })
    .where(ownPortion(ctx, portion.id))
    .returning();
  if (!row) throw appError("portion_not_found", 404);
  return { value: portionOf(row, ctx.userId), outcome: "changed" };
}

export async function removePortion(ctx: WriteContext, foodId: string, portionId: string): Promise<WriteOutcome<null>> {
  const portion = await findOwnPortion(ctx, foodId, portionId);
  const deleted = await ctx.db
    .delete(foodPortions)
    .where(ownPortion(ctx, portion.id))
    .returning({ id: foodPortions.id });
  if (deleted.length === 0) throw appError("portion_not_found", 404);
  return { value: null, outcome: "deleted" };
}

/** Marks or unmarks a food the user can see as a favourite. Idempotent. */
export async function setFavourite(ctx: WriteContext, foodId: string, favourite: boolean): Promise<WriteOutcome<null>> {
  const food = await findVisibleFood(ctx, foodId);
  if (favourite) {
    const added = await ctx.db.transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      return tx
        .insert(foodFavourites)
        .values({ userId: ctx.userId, foodId: food.id })
        .onConflictDoNothing()
        .returning({ foodId: foodFavourites.foodId });
    });
    return { value: null, outcome: added.length > 0 ? "created" : "unchanged" };
  }
  const removed = await ctx.db
    .delete(foodFavourites)
    .where(and(eq(foodFavourites.userId, ctx.userId), eq(foodFavourites.foodId, food.id)))
    .returning({ foodId: foodFavourites.foodId });
  return { value: null, outcome: removed.length > 0 ? "deleted" : "unchanged" };
}
