import type { CookAsRecipeBody, CookBody, CookLineBody, CookWriteResult, Figures, Recipe } from "@hovimestari/types";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  cookIngredients,
  cooks,
  entries,
  recipeIngredients,
  recipes,
  recipeTags,
  removedEntries,
} from "../../db/schema/index.js";
import type { Tx } from "../../db/types.js";
import { appError, lineError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { isForeignKeyViolation, isUniqueViolation } from "../../lib/pgErrors.js";
import { basisColumnsOf } from "../entryRows.js";
import { getCook } from "../reads/cooks.js";
import { getDays } from "../reads/days.js";
import { getRecipe } from "../reads/recipes.js";
import { ownRecipe } from "../recipeScope.js";
import { basisLine, cappedServingBasis, checkLine, readLineFoods, type CheckedLine } from "../recipeValues.js";
import { lockUserForWrite } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// A cook is a batch logged as made. Making one writes the cook, its lines,
// and the entries it feeds, in one transaction: the person's plain entries
// of the recipe it attaches, and the new servings it adds. Every entry from
// it takes its basis, computed once here from its lines and their foods as
// they are now. The recipe is not written.
//
// Lock order, as every recipe write: the user's row (key share), the recipe
// FOR SHARE, the user's own foods among the lines FOR SHARE in id order
// (readLineFoods), then the attached entries in id order.

/** A cook's line as its row, at `position`, from its check. */
function lineRow(ctx: WriteContext, cookId: string, line: CookLineBody, position: number, checked: CheckedLine | null) {
  const amount = checked?.amount;
  return {
    id: line.id.toLowerCase(),
    userId: ctx.userId,
    cookId,
    position,
    fromLineId: line.fromLineId?.toLowerCase() ?? null,
    foodId: checked?.food.id ?? null,
    grams: amount?.grams ?? null,
    portionId: amount?.portionId ?? null,
    portionCount: amount?.portionCount ?? null,
    portionUnit: amount?.portionUnit ?? null,
    portionName: amount?.portionName ?? null,
    name: line.counted ? null : line.name,
    writtenAmount: line.written?.amount ?? null,
    writtenUnit: line.written?.unit ?? null,
    note: line.note,
  };
}

/** A failure of a cook's insert as what it names, never a 500. */
function cookRefused(err: unknown): never {
  if (isUniqueViolation(err, "cook_ingredients_pkey")) throw appError("ingredient_id_taken", 409);
  // The user lock and the recipe's FOR SHARE come first, so these are a second line of defence.
  if (isForeignKeyViolation(err, "cooks_user_id_users_id_fk")) throw appError("user_not_found", 404);
  if (isForeignKeyViolation(err, "cooks_recipe_fk")) throw appError("recipe_not_found", 404);
  throw err;
}

/** The status columns of an entry going from `from` to `to`, as a status change sets them. */
function statusColumns(ctx: WriteContext, row: typeof entries.$inferSelect, to: "planned" | "eaten") {
  if (to === row.status) return {};
  return { status: to, eatenAt: to === "eaten" ? ctx.now : null };
}

/**
 * Attaches the user's plain entries `ids` of recipe `recipeId` to the cook:
 * each takes the cook and its basis, and the status `attachStatus` names for
 * it. Each must be the user's, of this recipe, and from no cook, else 400
 * `cook_entry_invalid` and the whole cook is refused. Eaten on a date after
 * today: 400 `entry_eaten_in_future`. Locked in id order, as the batches lock
 * entries.
 */
async function attach(tx: Tx, ctx: WriteContext, cookId: string, recipeId: string, basis: Figures, body: CookBody) {
  if (body.attach.length === 0) return;
  const ids = body.attach.map((id) => id.toLowerCase());
  const locked = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.userId, ctx.userId), inArray(entries.id, ids)))
    .orderBy(asc(entries.id))
    .for("no key update");
  const fits = (e: (typeof locked)[number]) => e.kind === "recipe" && e.recipeId === recipeId && e.cookId === null;
  if (locked.length !== ids.length || !locked.every(fits)) throw appError("cook_entry_invalid", 400);
  const statusOf = new Map(body.attachStatus.map((s) => [s.id.toLowerCase(), s.status]));
  for (const row of locked) {
    const status = statusOf.get(row.id);
    if (status === "eaten" && row.date > ctx.today) throw appError("entry_eaten_in_future", 400);
    await tx
      .update(entries)
      .set({ cookId, ...basisColumnsOf(basis), ...(status ? statusColumns(ctx, row, status) : {}), updatedAt: ctx.now })
      .where(eq(entries.id, row.id));
  }
}

/**
 * Puts the new servings of `body.add` on their days, each a recipe entry of
 * the cook with its basis, in the order given. An id already in use, or
 * removed in the last ten minutes, answers 409 `entry_id_taken`.
 */
async function addServings(tx: Tx, ctx: WriteContext, cookId: string, basis: Figures, body: CookBody) {
  if (body.add.length === 0) return;
  const ids = body.add.map((a) => a.id.toLowerCase());
  const [held] = await tx.select({ id: entries.id }).from(entries).where(inArray(entries.id, ids)).limit(1);
  const [removed] = await tx
    .select({ id: removedEntries.id })
    .from(removedEntries)
    .where(inArray(removedEntries.id, ids))
    .limit(1);
  if (held || removed) throw appError("entry_id_taken", 409);
  for (const add of body.add) {
    const inserted = await tx
      .insert(entries)
      .values({
        id: add.id.toLowerCase(),
        userId: ctx.userId,
        date: add.date,
        status: add.status,
        eatenAt: add.status === "eaten" ? ctx.now : null,
        kind: "recipe",
        recipeId: body.recipeId,
        servings: add.servings,
        cookId,
        ...basisColumnsOf(basis),
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .onConflictDoNothing({ target: entries.id })
      .returning({ id: entries.id });
    // Another request took the id while this one ran.
    if (inserted.length === 0) throw appError("entry_id_taken", 409);
  }
}

/** What a cook write answers: the cook, the entries the request named, in date and position order, and their days. */
async function answerOf(ctx: WriteContext, body: CookBody): Promise<Omit<CookWriteResult, "outcome">> {
  const cook = await getCook(ctx, body.id);
  const named = new Set([...body.attach, ...body.add.map((a) => a.id)].map((id) => id.toLowerCase()));
  const fed = cook.entries.filter((e) => named.has(e.id));
  return {
    cook,
    entries: fed,
    days: await getDays(
      ctx,
      fed.map((e) => e.date),
    ),
  };
}

/**
 * Logs a batch of the user's recipe as made: the cook with the id the caller
 * chose, its lines and the servings it gave, the plain entries it attaches
 * and the new servings it adds, in one transaction. Its basis is one serving
 * of its lines from their foods now, and every entry it attaches or adds
 * takes it. Nothing else of the day changes, and the recipe is not written.
 * A repeated id of the user's answers the cook as it is now with `replayed`,
 * and writes nothing of the body: its `entries` are the cook's entries the
 * repeat's body names, as a repeated copy answers the ids its body names.
 * Another user's id: 409 `cook_id_taken`. A recipe the user cannot
 * see: 404 `recipe_not_found`. A line refused: its code with its `line`. A
 * serving past what an entry holds: 400 `recipe_serving_too_large`.
 */
export async function createCook(ctx: WriteContext, body: CookBody): Promise<WriteOutcome<CookWriteResult>> {
  const created = await ctx.db
    .transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      const [held] = await tx.select({ userId: cooks.userId }).from(cooks).where(eq(cooks.id, body.id));
      if (held && held.userId !== ctx.userId) throw appError("cook_id_taken", 409);
      if (held) return false;
      for (const add of body.add) {
        if (add.status === "eaten" && add.date > ctx.today) throw appError("entry_eaten_in_future", 400);
      }
      const [recipe] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(and(eq(recipes.id, body.recipeId), ownRecipe(ctx.userId)))
        .for("share");
      if (!recipe) throw appError("recipe_not_found", 404);
      // A line keeps a food the recipe holds, even one hidden or retired since.
      const known = await tx
        .select({ foodId: recipeIngredients.foodId })
        .from(recipeIngredients)
        .where(and(eq(recipeIngredients.recipeId, recipe.id), isNotNull(recipeIngredients.foodId)));
      const foodIds = body.lines.flatMap((l) => (l.counted ? [l.foodId] : []));
      const lineFoods = await readLineFoods(
        tx,
        ctx,
        foodIds,
        known.map((k) => k.foodId!),
        { lock: true },
      );
      const checked: (CheckedLine | null)[] = [];
      for (const [index, line] of body.lines.entries()) {
        const check = await checkLine(tx, ctx, line, lineFoods);
        if (check.refusal !== null) throw lineError(check.refusal, check.status, index);
        checked.push(check.checked);
      }
      const basis = cappedServingBasis(checked.map(basisLine), body.servings);
      if (basis === null) throw appError("recipe_serving_too_large", 400);

      const [cook] = await tx
        .insert(cooks)
        .values({
          id: body.id.toLowerCase(),
          userId: ctx.userId,
          recipeId: recipe.id,
          date: body.date,
          servings: body.servings,
          ...basisColumnsOf(basis),
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        // A repeat in flight took the id: answered as its replay below.
        .onConflictDoNothing()
        .returning({ id: cooks.id });
      if (!cook) return false;
      await tx.insert(cookIngredients).values(body.lines.map((line, i) => lineRow(ctx, cook.id, line, i, checked[i]!)));
      await attach(tx, ctx, cook.id, recipe.id, basis, body);
      await addServings(tx, ctx, cook.id, basis, body);
      return true;
    })
    .catch(cookRefused);
  if (!created) {
    const [mine] = await ctx.db
      .select({ id: cooks.id })
      .from(cooks)
      .where(and(eq(cooks.id, body.id), eq(cooks.userId, ctx.userId)));
    if (!mine) throw appError("cook_id_taken", 409);
  }
  const outcome = created ? "created" : "replayed";
  return { value: { ...(await answerOf(ctx, body)), outcome }, outcome };
}

/**
 * Saves the user's cook `cookId` as a new recipe with the id the caller
 * chose and `name`: the cook's lines, with new ids, and the servings it gave,
 * and its recipe's time, steps, notes and tags. No image. The cook and its
 * entries keep pointing where they did. A repeated id of the user's answers
 * the recipe with `replayed`. Another user's: 409 `recipe_id_taken`.
 * Unknown cook: 404 `cook_not_found`. A serving of its lines from their
 * foods now past what an entry holds: 400 `recipe_serving_too_large`, as
 * `createRecipe` refuses it.
 */
export async function saveCookAsRecipe(
  ctx: WriteContext,
  cookId: string,
  body: CookAsRecipeBody,
): Promise<WriteOutcome<Recipe>> {
  if (!isUuid(cookId)) throw appError("cook_not_found", 404);
  const created = await ctx.db.transaction(async (tx) => {
    await lockUserForWrite(tx, ctx.userId);
    const [held] = await tx.select({ userId: recipes.userId }).from(recipes).where(eq(recipes.id, body.id));
    if (held && held.userId !== ctx.userId) throw appError("recipe_id_taken", 409);
    if (held) return false;
    // FOR SHARE, so a purge of the cook as an orphan waits for the copy, or the copy answers cook_not_found.
    const [cook] = await tx
      .select()
      .from(cooks)
      .where(and(eq(cooks.id, cookId), eq(cooks.userId, ctx.userId)))
      .for("share");
    if (!cook) throw appError("cook_not_found", 404);
    // The new recipe must be one createRecipe would take: one serving of its
    // lines from their foods now within an entry's cap. Its own foods FOR
    // SHARE in id order, as every write that reads foods into lines. A line
    // keeps its food, hidden or retired since, as a line kept on a recipe does.
    const counted = await tx
      .select({ foodId: cookIngredients.foodId, grams: cookIngredients.grams })
      .from(cookIngredients)
      .where(
        and(
          eq(cookIngredients.cookId, cook.id),
          eq(cookIngredients.userId, ctx.userId),
          isNotNull(cookIngredients.foodId),
        ),
      );
    const foodIds = counted.map((l) => l.foodId!);
    const lineFoods = await readLineFoods(tx, ctx, foodIds, foodIds, { lock: true });
    const basisLines = counted.map((l) => ({ food: lineFoods.get(l.foodId!)!, grams: l.grams }));
    if (cappedServingBasis(basisLines, cook.servings) === null) throw appError("recipe_serving_too_large", 400);
    const [source] = await tx.select().from(recipes).where(eq(recipes.id, cook.recipeId));
    const [recipe] = await tx
      .insert(recipes)
      .values({
        id: body.id,
        userId: ctx.userId,
        name: body.name,
        servings: cook.servings,
        timeMinutes: source!.timeMinutes,
        steps: source!.steps,
        notes: source!.notes,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .onConflictDoNothing()
      .returning({ id: recipes.id });
    if (!recipe) return false;
    // The lines copied as stored, each with a new id: the food, the amount and how it was typed.
    await tx.execute(sql`
      INSERT INTO ${recipeIngredients} (id, user_id, recipe_id, position, food_id, grams, portion_id, portion_count,
                                        portion_unit, portion_name, name, written_amount, written_unit, note)
      SELECT gen_random_uuid(), user_id, ${recipe.id}, position, food_id, grams, portion_id, portion_count,
             portion_unit, portion_name, name, written_amount, written_unit, note
        FROM ${cookIngredients}
       WHERE ${cookIngredients.cookId} = ${cook.id} AND ${cookIngredients.userId} = ${ctx.userId}`);
    await tx.execute(sql`
      INSERT INTO ${recipeTags} (user_id, recipe_id, tag)
      SELECT user_id, ${recipe.id}, tag FROM ${recipeTags} WHERE ${recipeTags.recipeId} = ${cook.recipeId}`);
    return true;
  });
  if (!created) {
    const [mine] = await ctx.db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, body.id), eq(recipes.userId, ctx.userId)));
    if (!mine) throw appError("recipe_id_taken", 409);
  }
  return { value: await getRecipe(ctx, body.id), outcome: created ? "created" : "replayed" };
}
