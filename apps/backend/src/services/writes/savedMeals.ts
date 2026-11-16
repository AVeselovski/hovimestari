import type { SaveAndLogBody, SaveAndLogResult, SavedMeal, SavedMealBody, SavedMealEditBody } from "@hovimestari/types";
import { and, eq, isNull, sql } from "drizzle-orm";
import { savedMeals } from "../../db/schema/index.js";
import type { Tx } from "../../db/types.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { isForeignKeyViolation } from "../../lib/pgErrors.js";
import { getSavedMeal, ownMeal } from "../reads/savedMeals.js";
import { isUsed, lockUserForWrite, restoreCutoff, rewritePlannedBasis } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";
import { addEntry } from "./entries.js";

// A saved meal is the user's own, found by id and user_id, never another
// user's (404). A deleted meal is invisible to every write. Every write that
// inserts or locks rows takes the user's row first (lockUserForWrite).
// Archiving does not: it is one UPDATE of the meal's own row, which holds no
// other lock and so cannot deadlock, and a meal its owner's deletion took
// answers 404 `saved_meal_not_found` like any other missing meal.

const columnsOf = (body: SavedMealEditBody) => ({
  name: body.name,
  source: body.source,
  energyKcal: body.figures.energyKcal,
  proteinG: body.figures.proteinG,
  carbsG: body.figures.carbsG,
  fatG: body.figures.fatG,
});

/**
 * Creates a saved meal with the id the caller chose. A repeated id of the
 * user's answers the meal with `replayed`. Another user's id answers 409
 * `saved_meal_id_taken`.
 */
export async function createSavedMeal(ctx: WriteContext, body: SavedMealBody): Promise<WriteOutcome<SavedMeal>> {
  const created = await ctx.db
    .transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      return (
        tx
          .insert(savedMeals)
          .values({ id: body.id, userId: ctx.userId, ...columnsOf(body), createdAt: ctx.now, updatedAt: ctx.now })
          // No target: a repeat in flight can meet the (id, user_id) constraint
          // before the primary key, and either conflict means the id is taken.
          .onConflictDoNothing()
          .returning({ id: savedMeals.id })
      );
    })
    .catch((err: unknown) => {
      // The user lock comes first, so this is a second line of defence.
      if (isForeignKeyViolation(err, "saved_meals_user_id_users_id_fk")) throw appError("user_not_found", 404);
      throw err;
    });
  if (created.length > 0) return { value: await getSavedMeal(ctx, body.id), outcome: "created" };
  const [mine] = await ctx.db
    .select({ id: savedMeals.id })
    .from(savedMeals)
    .where(and(eq(savedMeals.id, body.id), eq(savedMeals.userId, ctx.userId)));
  if (!mine) throw appError("saved_meal_id_taken", 409);
  return { value: await getSavedMeal(ctx, body.id), outcome: "replayed" };
}

/** Locks the user's meal `id` for the rest of the transaction, or 404 `saved_meal_not_found`. */
async function lockMeal(tx: Tx, ctx: WriteContext, id: string): Promise<typeof savedMeals.$inferSelect> {
  if (!isUuid(id)) throw appError("saved_meal_not_found", 404);
  await lockUserForWrite(tx, ctx.userId);
  const [meal] = await tx
    .select()
    .from(savedMeals)
    .where(and(eq(savedMeals.id, id), ownMeal(ctx.userId)))
    .for("update");
  if (!meal) throw appError("saved_meal_not_found", 404);
  return meal;
}

/**
 * Edits the user's saved meal, then, in the same transaction, rewrites the
 * basis of its planned entries dated today or later. Eaten entries and every
 * past day keep the values they were added with.
 */
export async function updateSavedMeal(
  ctx: WriteContext,
  id: string,
  body: SavedMealEditBody,
): Promise<WriteOutcome<SavedMeal>> {
  await ctx.db.transaction(async (tx) => {
    const meal = await lockMeal(tx, ctx, id);
    const next = columnsOf(body);
    await tx
      .update(savedMeals)
      .set({ ...next, updatedAt: ctx.now })
      .where(eq(savedMeals.id, meal.id));
    await rewritePlannedBasis(tx, ctx, { kind: "saved_meal", id: meal.id }, body.figures);
  });
  return { value: await getSavedMeal(ctx, id), outcome: "changed" };
}

/** Archives or restores the user's saved meal. Idempotent: archiving twice keeps the first time. */
export async function setSavedMealArchived(
  ctx: WriteContext,
  id: string,
  archived: boolean,
): Promise<WriteOutcome<null>> {
  if (!isUuid(id)) throw appError("saved_meal_not_found", 404);
  const changed = await ctx.db
    .update(savedMeals)
    .set({ archivedAt: archived ? sql`coalesce(${savedMeals.archivedAt}, ${ctx.now})` : null })
    .where(and(eq(savedMeals.id, id), ownMeal(ctx.userId)))
    .returning({ id: savedMeals.id });
  if (changed.length === 0) throw appError("saved_meal_not_found", 404);
  return { value: null, outcome: "changed" };
}

/**
 * Deletes the user's saved meal. One that entries use, or that an entry
 * removed in the last ten minutes used, is hidden instead, so every day keeps
 * its rows and a restore still finds it. The row lock waits for an add that
 * holds the meal, so the check sees that add.
 */
export async function deleteSavedMeal(ctx: WriteContext, id: string): Promise<WriteOutcome<null>> {
  await ctx.db.transaction(async (tx) => {
    const meal = await lockMeal(tx, ctx, id);
    if (await isUsed(tx, ctx, { kind: "saved_meal", id: meal.id }, restoreCutoff(ctx))) {
      await tx
        .update(savedMeals)
        .set({ deletedAt: ctx.now, updatedAt: ctx.now })
        .where(and(eq(savedMeals.id, meal.id), isNull(savedMeals.deletedAt)));
    } else {
      await tx.delete(savedMeals).where(eq(savedMeals.id, meal.id));
    }
  });
  return { value: null, outcome: "deleted" };
}

/**
 * Creates a saved meal and logs it in one transaction: `createSavedMeal` then
 * `addEntry`. A retry replays both. An entry the user undid or removed since
 * is not added again: the answer carries no entry.
 */
export async function saveAndLog(ctx: WriteContext, body: SaveAndLogBody): Promise<WriteOutcome<SaveAndLogResult>> {
  const result = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    const inTx = { ...ctx, db: tx };
    await createSavedMeal(inTx, body.meal);
    const logged = await addEntry(inTx, { kind: "saved_meal", savedMealId: body.meal.id, ...body.entry });
    return { logged };
  });
  const { entry, days } = result.logged.value;
  const outcome = result.logged.outcome === "created" ? "created" : "replayed";
  // Read again after the log, so the meal's last count includes it.
  return { value: { meal: await getSavedMeal(ctx, body.meal.id), entry, days, outcome }, outcome };
}
