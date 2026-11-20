import { gramsForPortion, MAX_ENTRY_GRAMS, MAX_FIGURE_G, MAX_FIGURE_KCAL, type Figures } from "@hovimestari/types";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import {
  cookIngredients,
  entries,
  foodPortions,
  foods,
  recipeIngredients,
  recipes,
  removedEntries,
  RESTORE_WINDOW_MS,
  savedMeals,
  users,
} from "../db/schema/index.js";
import type { Db, Tx } from "../db/types.js";
import { AppError, appError } from "../lib/errors.js";
import { basisColumnsOf } from "./entryRows.js";
import { portionVisibleTo, visibleFood } from "./foodScope.js";
import type { ReadContext } from "./reads/context.js";
import { ownMeal } from "./reads/savedMeals.js";
import { ownRecipe } from "./recipeScope.js";
import { figuresPastCap, fitsEntry, readRecipeServings, servingOf } from "./recipeValues.js";

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

/** A food, a saved meal or a recipe that entries are added from. */
export type EntrySource =
  { kind: "food"; id: string } | { kind: "saved_meal"; id: string } | { kind: "recipe"; id: string };

/** The entry column that names a source of `kind`, and its key in a removed entry's row. */
const SOURCE_COLUMNS = {
  food: [entries.foodId, "food_id"],
  saved_meal: [entries.savedMealId, "saved_meal_id"],
  recipe: [entries.recipeId, "recipe_id"],
} as const;

/** The oldest removal a restore still accepts at `ctx.now`. */
export const restoreCutoff = (ctx: ReadContext): Date => new Date(ctx.now.getTime() - RESTORE_WINDOW_MS);

/**
 * Whether the user's entries use `source`, or an entry they removed after
 * `cutoff` did, so a restore would need it. A food is also used while a line
 * of one of the user's recipes or cooks names it, any cook, orphan or not: a
 * hidden food costs nothing, and a deleted one would take the line from under
 * a cook. A recipe counts its entries and removed entries only: every entry
 * of a cook names the cook's recipe too, so a cook still in use already
 * counts through its entry, and an orphan cook must not keep its recipe. A new statement: called after the source's row lock,
 * it sees an add or a recipe save that committed while the lock waited.
 */
export async function isUsed(tx: Tx, ctx: ReadContext, source: EntrySource, cutoff: Date): Promise<boolean> {
  const [column, key] = SOURCE_COLUMNS[source.kind];
  const onRecipe =
    source.kind === "food"
      ? sql`OR EXISTS (SELECT 1 FROM ${recipeIngredients}
                        WHERE ${recipeIngredients.foodId} = ${source.id} AND ${recipeIngredients.userId} = ${ctx.userId})
            OR EXISTS (SELECT 1 FROM ${cookIngredients}
                        WHERE ${cookIngredients.foodId} = ${source.id} AND ${cookIngredients.userId} = ${ctx.userId})`
      : sql``;
  const { rows } = await tx.execute<{ used: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM ${entries} WHERE ${column} = ${source.id} AND ${entries.userId} = ${ctx.userId})
        OR EXISTS (SELECT 1 FROM ${removedEntries}
                    WHERE ${removedEntries.userId} = ${ctx.userId}
                      AND ${removedEntries.removedAt} >= ${cutoff}
                      AND ${removedEntries.row}->>${key} = ${source.id})
        ${onRecipe} AS used`);
  return rows[0].used;
}

/**
 * A source whose edit rewrites planned entries. A food carries its values
 * per 100 g from before the edit, so a recipe on it can be compared.
 */
export type EditedSource =
  { kind: "food"; id: string; before: Figures } | { kind: "saved_meal"; id: string } | { kind: "recipe"; id: string };

/** How many recipe names a refusal names. The rest it counts. */
const NAMED_RECIPES = 3;

/**
 * Rewrites the basis of the user's planned entries dated today or later that
 * `source` reaches, from the source as it is now. Eaten entries and past days
 * keep theirs. A food reaches its own entries and the entries of every recipe
 * the user can see with a line on it. A deleted recipe is not reached, so its
 * entries keep their figures. A saved meal or a recipe reaches its own
 * entries. Three steps, so the figures are always read after the locks:
 *
 * 1. Lock every entry it reaches, in one statement in id order, as the
 *    status batch and the removals lock them, so none of them deadlock.
 * 2. Read the food's or meal's values and each recipe's serving, in a new
 *    statement, which sees every edit that committed while step 1 waited.
 * 3. Write each source's basis to its locked entries.
 *
 * Called after the caller's own write of the source, in its transaction, so
 * step 2 reads that write. It takes no lock on a food or a recipe.
 *
 * A recipe whose serving is past what an entry holds keeps the basis its
 * entries have. An own food's edit is refused with 400
 * `food_edit_recipe_too_large`, and rolls back with it, when it takes a
 * reached recipe's serving past the cap or raises a figure already past it.
 * The refusal names the recipes. An edit that lowers a serving past the cap
 * passes.
 */
export async function rewritePlannedBasis(tx: Tx, ctx: ReadContext, source: EditedSource): Promise<void> {
  const locked = await lockReached(tx, ctx, source);
  if (locked.length === 0) return;

  const writes: { basis: Figures; ids: string[] }[] = [];
  if (source.kind !== "recipe") {
    const own = locked.filter((e) => (source.kind === "food" ? e.foodId : e.savedMealId) === source.id);
    if (own.length > 0) {
      const basis = source.kind === "food" ? await foodValues(tx, source.id) : await mealValues(tx, source.id);
      writes.push({ basis, ids: own.map((e) => e.id) });
    }
  }

  const recipeIds = [...new Set(locked.flatMap((e) => (e.recipeId === null ? [] : [e.recipeId])))];
  const servings = await readRecipeServings(tx, ctx, recipeIds, { lock: false });
  const raised: string[] = [];
  for (const recipeId of recipeIds) {
    // Every locked entry's recipe is the user's, by the entry's foreign key.
    const recipe = servings.get(recipeId)!;
    const basis = servingOf(recipe);
    if (fitsEntry(basis)) {
      writes.push({ basis, ids: locked.filter((e) => e.recipeId === recipeId).map((e) => e.id) });
      continue;
    }
    // Only a food's edit gets here. A saved meal reaches no recipe entry. A
    // recipe's own edit (updateRecipe) checks the cap on the same lines and
    // foods before it calls this, while it holds its own foods FOR SHARE, so
    // they cannot change in between. A second line of defence that no test
    // reaches, so a broken order answers a refusal rather than a wrong basis.
    if (source.kind !== "food") throw appError("recipe_serving_too_large", 400);
    if (raisesPastCap(servingOf(recipe, { id: source.id, per100g: source.before }), basis)) raised.push(recipe.name);
  }
  if (raised.length > 0) throw recipesTooLarge(raised);

  for (const { basis, ids } of writes) {
    await tx
      .update(entries)
      .set({ ...basisColumnsOf(basis), updatedAt: ctx.now })
      .where(and(eq(entries.userId, ctx.userId), inArray(entries.id, ids)));
  }
}

/** Step 1: the plain planned entries from today on that `source` reaches, locked in id order. A cook's are never reached. */
function lockReached(tx: Tx, ctx: ReadContext, source: EditedSource) {
  const onRecipes = tx
    .select({ id: recipeIngredients.recipeId })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
    .where(
      and(eq(recipeIngredients.foodId, source.id), eq(recipeIngredients.userId, ctx.userId), ownRecipe(ctx.userId)),
    );
  const reached =
    source.kind === "food"
      ? or(eq(entries.foodId, source.id), inArray(entries.recipeId, onRecipes))
      : eq(SOURCE_COLUMNS[source.kind][0], source.id);
  return tx
    .select({ id: entries.id, foodId: entries.foodId, savedMealId: entries.savedMealId, recipeId: entries.recipeId })
    .from(entries)
    .where(
      and(
        eq(entries.userId, ctx.userId),
        eq(entries.status, "planned"),
        gte(entries.date, ctx.today),
        // A cook's entry carries its cook's basis, which no food or recipe edit rewrites.
        isNull(entries.cookId),
        reached,
      ),
    )
    .orderBy(asc(entries.id))
    .for("no key update");
}

/** Whether a figure of `after` is past its cap and higher than in `before`. */
function raisesPastCap(before: Figures, after: Figures): boolean {
  return figuresPastCap(after).some((key) => after[key] > before[key]);
}

/** The refusal of a food's edit, naming the first recipes by name and counting the rest. */
function recipesTooLarge(names: string[]): AppError {
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const recipes = sorted.slice(0, NAMED_RECIPES);
  const more = sorted.length - recipes.length;
  const which =
    sorted.length === 1
      ? `A planned serving of ${recipes[0]}`
      : `Planned servings of ${recipes.join(", ")}${more > 0 ? `, and ${more} more ${more === 1 ? "recipe" : "recipes"},` : ""}`;
  const change = sorted.length === 1 ? "the recipe or its" : "those recipes or their";
  return new AppError(
    `${which} would come to more than ${MAX_FIGURE_KCAL} kcal or ${MAX_FIGURE_G} g of a macro. Change ${change} planned entries first.`,
    400,
    { code: "food_edit_recipe_too_large", details: { recipe: recipes[0], others: sorted.length - 1, recipes } },
  );
}

/** A food's values per 100 g as they are now. */
async function foodValues(tx: Tx, foodId: string): Promise<Figures> {
  const [food] = await tx
    .select({ energyKcal: foods.energyKcal, proteinG: foods.proteinG, carbsG: foods.carbsG, fatG: foods.fatG })
    .from(foods)
    .where(eq(foods.id, foodId));
  return food;
}

/** A saved meal's figures for one meal as they are now. */
async function mealValues(tx: Tx, mealId: string): Promise<Figures> {
  const [meal] = await tx
    .select({
      energyKcal: savedMeals.energyKcal,
      proteinG: savedMeals.proteinG,
      carbsG: savedMeals.carbsG,
      fatG: savedMeals.fatG,
    })
    .from(savedMeals)
    .where(eq(savedMeals.id, mealId));
  return meal;
}
