import { gramsForPortion, MAX_ENTRY_GRAMS, type Figures } from "@hovimestari/types";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  entries,
  foodPortions,
  foods,
  removedEntries,
  RESTORE_WINDOW_MS,
  savedMeals,
  users,
} from "../db/schema/index.js";
import type { Db, Tx } from "../db/types.js";
import { appError } from "../lib/errors.js";
import { basisColumnsOf } from "./entryRows.js";
import { portionVisibleTo, visibleFood } from "./foodScope.js";
import type { ReadContext } from "./reads/context.js";
import { ownMeal } from "./reads/savedMeals.js";

// The only place an entry's basis is taken from its source. A source is read
// FOR SHARE, so an edit of it waits until the add commits, and the edit's
// rewrite of planned entries (a later statement) then sees the new entry. An
// add that comes second waits for the edit and reads the new values.

/**
 * Takes the user's row FOR KEY SHARE, the lock an entry's foreign key takes
 * anyway, before any source row. Every entry and saved-meal write takes it
 * first, so its locks come in the same order as an account deletion's (user
 * row, then what cascades). It never waits behind a session or targets
 * write, which hold FOR NO KEY UPDATE. A user deleted meanwhile, or while it
 * waited, answers 404 `user_not_found`, as a deleted user's live access
 * token does at `contextFor`.
 */
export async function lockUserForWrite(tx: Tx, userId: string): Promise<void> {
  const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("key share");
  if (!user) throw appError("user_not_found", 404);
}

/** A food the user can log, read FOR SHARE: its values per 100 g are the entry's basis. 404 `food_not_found`. */
export async function readFoodForEntry(tx: Tx, ctx: ReadContext, foodId: string): Promise<Figures> {
  const [food] = await tx
    .select({ energyKcal: foods.energyKcal, proteinG: foods.proteinG, carbsG: foods.carbsG, fatG: foods.fatG })
    .from(foods)
    .where(visibleFood(ctx.userId, foodId))
    .for("share");
  if (!food) throw appError("food_not_found", 404);
  return food;
}

/** One of the user's saved meals, archived or not, read FOR SHARE: its figures per meal are the basis. 404 `saved_meal_not_found`. */
export async function readMealForEntry(tx: Tx, ctx: ReadContext, mealId: string): Promise<Figures> {
  const [meal] = await tx
    .select({
      energyKcal: savedMeals.energyKcal,
      proteinG: savedMeals.proteinG,
      carbsG: savedMeals.carbsG,
      fatG: savedMeals.fatG,
    })
    .from(savedMeals)
    .where(and(eq(savedMeals.id, mealId), ownMeal(ctx.userId)))
    .for("share");
  if (!meal) throw appError("saved_meal_not_found", 404);
  return meal;
}

/** A food entry's amount as stored: grams, and how it was entered when it was a count of a portion. */
export interface StoredAmount {
  grams: number;
  portionId: string | null;
  portionCount: number | null;
  portionUnit: string | null;
  portionName: string | null;
}

/**
 * `count` of portion `portionId` of food `foodId` in grams. The portion must
 * be the food's and visible to the user, else 404 `portion_not_found`. A
 * weight the entry cannot hold (zero after rounding, or over 5000 g) answers
 * 400 `entry_grams_invalid`.
 */
export async function gramsOf(
  db: Db,
  ctx: ReadContext,
  foodId: string,
  amount: { grams: number } | { portionId: string; count: number },
): Promise<StoredAmount> {
  if ("grams" in amount) {
    return { grams: amount.grams, portionId: null, portionCount: null, portionUnit: null, portionName: null };
  }
  const [portion] = await db
    .select()
    .from(foodPortions)
    .where(and(eq(foodPortions.id, amount.portionId), eq(foodPortions.foodId, foodId), portionVisibleTo(ctx.userId)));
  if (!portion) throw appError("portion_not_found", 404);
  const grams = gramsForPortion(amount.count, portion.grams);
  if (grams <= 0 || grams > MAX_ENTRY_GRAMS) throw appError("entry_grams_invalid", 400);
  return {
    grams,
    portionId: portion.id,
    portionCount: amount.count,
    portionUnit: portion.fineliUnit,
    portionName: portion.name,
  };
}

/** A food or a saved meal that entries are added from. */
export type EntrySource = { kind: "food"; id: string } | { kind: "saved_meal"; id: string };

/** The oldest removal a restore still accepts at `ctx.now`. */
export const restoreCutoff = (ctx: ReadContext): Date => new Date(ctx.now.getTime() - RESTORE_WINDOW_MS);

/**
 * Whether the user's entries use `source`, or an entry they removed after
 * `cutoff` did, so a restore would need it. A new statement: called after the
 * source's row lock, it sees an add that committed while the lock waited.
 */
export async function isUsed(tx: Tx, ctx: ReadContext, source: EntrySource, cutoff: Date): Promise<boolean> {
  const [column, key] = source.kind === "food" ? [entries.foodId, "food_id"] : [entries.savedMealId, "saved_meal_id"];
  const { rows } = await tx.execute<{ used: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM ${entries} WHERE ${column} = ${source.id} AND ${entries.userId} = ${ctx.userId})
        OR EXISTS (SELECT 1 FROM ${removedEntries}
                    WHERE ${removedEntries.userId} = ${ctx.userId}
                      AND ${removedEntries.removedAt} >= ${cutoff}
                      AND ${removedEntries.row}->>${key} = ${source.id}) AS used`);
  return rows[0].used;
}

/**
 * Sets the basis of the user's planned entries of `source` dated today or
 * later to `figures`. Eaten entries and past days keep theirs. The rows are
 * locked in id order first, as the status batch locks them, so the two never
 * deadlock over the same entries.
 */
export async function rewritePlannedBasis(
  tx: Tx,
  ctx: ReadContext,
  source: EntrySource,
  figures: Figures,
): Promise<void> {
  const planned = and(
    eq(entries.userId, ctx.userId),
    eq(source.kind === "food" ? entries.foodId : entries.savedMealId, source.id),
    eq(entries.status, "planned"),
    gte(entries.date, ctx.today),
  );
  const locked = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(planned)
    .orderBy(asc(entries.id))
    .for("no key update");
  if (locked.length === 0) return;
  await tx
    .update(entries)
    .set({ ...basisColumnsOf(figures), updatedAt: ctx.now })
    .where(
      and(
        planned,
        inArray(
          entries.id,
          locked.map((r) => r.id),
        ),
      ),
    );
}
