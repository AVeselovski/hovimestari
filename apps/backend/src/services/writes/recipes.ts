import type { Figures, IngredientLineBody, Recipe, RecipeBody, RecipeEditBody } from "@hovimestari/types";
import { and, asc, eq, sql } from "drizzle-orm";
import { recipeIngredients, recipes, recipeTags } from "../../db/schema/index.js";
import type { Tx } from "../../db/types.js";
import { appError, lineError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { isForeignKeyViolation, isUniqueViolation } from "../../lib/pgErrors.js";
import { getRecipe, ownRecipe } from "../reads/recipes.js";
import { basisLine, cappedServingBasis, checkLine, readLineFoods, type CheckedLine } from "../recipeValues.js";
import { lockUserForWrite } from "../sourceValues.js";
import type { WriteContext, WriteOutcome } from "./context.js";

// A recipe is the user's own, found by id and user_id, never another user's
// (404). A deleted recipe is invisible to every write. A create or an edit
// takes the user's row, then the recipe's, then the user's own foods among
// its lines FOR SHARE (readLineFoods), in that order, so it never deadlocks
// with a food edit or delete, which take the food's row and then entries.
// Archiving and the favourite are one UPDATE of the recipe's own row each,
// which holds no other lock, as archiving a saved meal does.

const LINE_ID_KEY = "recipe_ingredients_pkey";

/** The recipe's own columns, as a body gives them. */
const columnsOf = (body: RecipeEditBody) => ({
  name: body.name,
  servings: body.servings,
  timeMinutes: body.timeMinutes,
  steps: body.steps,
  notes: body.notes,
});

/** A line as its row, at `position`, from its check. */
function lineRow(
  ctx: WriteContext,
  recipeId: string,
  line: IngredientLineBody,
  position: number,
  checked: CheckedLine | null,
) {
  const amount = checked?.amount;
  return {
    id: line.id.toLowerCase(),
    userId: ctx.userId,
    recipeId,
    position,
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

type LineRow = ReturnType<typeof lineRow>;

/**
 * The body's lines checked and turned into rows, after the user's own foods
 * among them are locked FOR SHARE, with what a serving comes to. The first
 * refused line throws its code with its index. `basis` is null when a
 * serving comes to more than an entry holds: the caller refuses it.
 */
async function checkedRows(
  tx: Tx,
  ctx: WriteContext,
  recipeId: string,
  body: RecipeEditBody,
  knownFoodIds: string[],
): Promise<{ rows: LineRow[]; basis: Figures | null }> {
  const foodIds = body.lines.flatMap((l) => (l.counted ? [l.foodId] : []));
  const lineFoods = await readLineFoods(tx, ctx, foodIds, knownFoodIds, { lock: true });
  const checked: (CheckedLine | null)[] = [];
  for (const [index, line] of body.lines.entries()) {
    const check = await checkLine(tx, ctx, line, lineFoods);
    if (check.refusal !== null) throw lineError(check.refusal, check.status, index);
    checked.push(check.checked);
  }
  return {
    rows: body.lines.map((line, index) => lineRow(ctx, recipeId, line, index, checked[index])),
    basis: cappedServingBasis(checked.map(basisLine), body.servings),
  };
}

/** The rows, or `recipe_serving_too_large` when a serving comes to more than an entry holds. */
function withinCap({ rows, basis }: { rows: LineRow[]; basis: Figures | null }): LineRow[] {
  if (basis === null) throw appError("recipe_serving_too_large", 400);
  return rows;
}

/** Every column a line row holds, so two rows compare by value, whatever order their keys were built in. */
const LINE_COLUMNS = [
  "id",
  "userId",
  "recipeId",
  "position",
  "foodId",
  "grams",
  "portionId",
  "portionCount",
  "portionUnit",
  "portionName",
  "name",
  "writtenAmount",
  "writtenUnit",
  "note",
] as const satisfies readonly (keyof LineRow & keyof typeof recipeIngredients.$inferSelect)[];

// A column a row gains without joining LINE_COLUMNS is a type error here, so the comparison never skips it.
const everyColumn: [Exclude<keyof LineRow, (typeof LINE_COLUMNS)[number]>] extends [never] ? true : never = true;
void everyColumn;

const sameLines = (a: readonly LineRow[], b: readonly (typeof recipeIngredients.$inferSelect)[]) =>
  a.length === b.length && a.every((row, i) => LINE_COLUMNS.every((column) => row[column] === b[i]![column]));

/**
 * The rows, each one under an id the recipe does not hold taking the id of a
 * line it does hold that no row claims by its id and that is the same in
 * every other column but the position. The first such line in order is
 * taken, each once, so two identical lines pair one to one. A line sent
 * again without its id, or under a new one, is then the line it was, and an
 * edit that changes nothing else writes nothing.
 */
function keepingIds(rows: LineRow[], current: readonly (typeof recipeIngredients.$inferSelect)[]): LineRow[] {
  const held = new Set(current.map((l) => l.id));
  const claimed = new Set(rows.map((r) => r.id));
  const unclaimed = current.filter((l) => !claimed.has(l.id));
  const alike = (row: LineRow, l: (typeof current)[number]) =>
    LINE_COLUMNS.every((column) => column === "id" || column === "position" || row[column] === l[column]);
  return rows.map((row) => {
    if (held.has(row.id)) return row;
    const i = unclaimed.findIndex((l) => alike(row, l));
    return i < 0 ? row : { ...row, id: unclaimed.splice(i, 1)[0]!.id };
  });
}

/** Whether the recipe's own columns already hold what `next` sets. */
const sameColumns = (next: ReturnType<typeof columnsOf>, recipe: typeof recipes.$inferSelect) =>
  next.name === recipe.name &&
  next.servings === recipe.servings &&
  next.timeMinutes === recipe.timeMinutes &&
  next.notes === recipe.notes &&
  next.steps.length === recipe.steps.length &&
  next.steps.every((step, i) => step === recipe.steps[i]);

/** Inserts a recipe's lines and tags. */
async function insertParts(tx: Tx, ctx: WriteContext, recipeId: string, rows: LineRow[], tags: string[]) {
  await tx.insert(recipeIngredients).values(rows);
  if (tags.length > 0) {
    await tx
      .insert(recipeTags)
      .values(tags.map((tag) => ({ userId: ctx.userId, recipeId, tag })))
      // The body keeps a tag once by JavaScript's lower case. A pair the database's lower() folds alike
      // ("İ" and "i" on a UTF-8 database) keeps the first, rather than failing the save.
      .onConflictDoNothing();
  }
}

/** A line id another recipe holds answers 409 `ingredient_id_taken`, a user gone meanwhile 404. */
function lineIdChecked(err: unknown): never {
  if (isUniqueViolation(err, LINE_ID_KEY)) throw appError("ingredient_id_taken", 409);
  // The user lock comes first, so this is a second line of defence.
  if (isForeignKeyViolation(err, "recipes_user_id_users_id_fk")) throw appError("user_not_found", 404);
  throw err;
}

/**
 * Creates a recipe with the id the caller chose, its lines and its tags. A
 * repeated id of the user's answers the recipe with `replayed` and ignores
 * the body. Another user's id answers 409 `recipe_id_taken`.
 */
export async function createRecipe(ctx: WriteContext, body: RecipeBody): Promise<WriteOutcome<Recipe>> {
  const created = await ctx.db
    .transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      const [row] = await tx
        .insert(recipes)
        .values({ id: body.id, userId: ctx.userId, ...columnsOf(body), createdAt: ctx.now, updatedAt: ctx.now })
        // No target: a repeat in flight can meet the (id, user_id) constraint before the primary key.
        .onConflictDoNothing()
        .returning({ id: recipes.id });
      if (!row) return false;
      await insertParts(tx, ctx, row.id, withinCap(await checkedRows(tx, ctx, row.id, body, [])), body.tags);
      return true;
    })
    .catch(lineIdChecked);
  if (created) return { value: await getRecipe(ctx, body.id), outcome: "created" };
  const [mine] = await ctx.db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, body.id), eq(recipes.userId, ctx.userId)));
  if (!mine) throw appError("recipe_id_taken", 409);
  return { value: await getRecipe(ctx, body.id), outcome: "replayed" };
}

/** Locks the user's recipe `id` for the rest of the transaction, after the user's row, or 404 `recipe_not_found`. */
async function lockRecipe(tx: Tx, ctx: WriteContext, id: string): Promise<typeof recipes.$inferSelect> {
  if (!isUuid(id)) throw appError("recipe_not_found", 404);
  await lockUserForWrite(tx, ctx.userId);
  const [recipe] = await tx
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), ownRecipe(ctx.userId)))
    .for("update");
  if (!recipe) throw appError("recipe_not_found", 404);
  return recipe;
}

const sameTags = (a: string[], b: string[]) => {
  const [x, y] = [[...a].sort(), [...b].sort()];
  return x.length === y.length && x.every((tag, i) => tag === y[i]);
};

/**
 * Edits the user's recipe, given whole: its columns, its lines and its tags.
 * A line keeps its id across the edit, and a line sent under an id the
 * recipe does not hold keeps the id of an identical line (`keepingIds`).
 * A line on a food the recipe already uses keeps it even when the food is
 * hidden or retired since, and a new food must be one the user can see. An
 * edit that changes nothing writes nothing and answers `unchanged`.
 */
export async function updateRecipe(ctx: WriteContext, id: string, body: RecipeEditBody): Promise<WriteOutcome<Recipe>> {
  const changed = await ctx.db
    .transaction(async (tx) => {
      const recipe = await lockRecipe(tx, ctx, id);
      const current = await tx
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, recipe.id))
        .orderBy(asc(recipeIngredients.position));
      const known = current.flatMap((l) => (l.foodId === null ? [] : [l.foodId]));
      const read = await checkedRows(tx, ctx, recipe.id, body, known);
      const checked = { ...read, rows: keepingIds(read.rows, current) };
      const tags = await tx.select({ tag: recipeTags.tag }).from(recipeTags).where(eq(recipeTags.recipeId, recipe.id));
      const next = columnsOf(body);
      const same =
        sameColumns(next, recipe) &&
        sameLines(checked.rows, current) &&
        sameTags(
          body.tags,
          tags.map((t) => t.tag),
        );
      // An edit of nothing answers unchanged even when a food edited since takes a serving past the cap.
      if (same) return false;
      const rows = withinCap(checked);
      await tx
        .update(recipes)
        .set({ ...next, updatedAt: ctx.now })
        .where(eq(recipes.id, recipe.id));
      // Lines go and come back by id, so positions never meet the unique index halfway.
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));
      await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipe.id));
      await insertParts(tx, ctx, recipe.id, rows, body.tags);
      return true;
    })
    .catch(lineIdChecked);
  return { value: await getRecipe(ctx, id), outcome: changed ? "changed" : "unchanged" };
}

/** Archives or restores the user's recipe. Idempotent: archiving twice keeps the first time. */
export async function setRecipeArchived(ctx: WriteContext, id: string, archived: boolean): Promise<WriteOutcome<null>> {
  if (!isUuid(id)) throw appError("recipe_not_found", 404);
  const changed = await ctx.db
    .update(recipes)
    .set({ archivedAt: archived ? sql`coalesce(${recipes.archivedAt}, ${ctx.now})` : null })
    .where(and(eq(recipes.id, id), ownRecipe(ctx.userId)))
    .returning({ id: recipes.id });
  if (changed.length === 0) throw appError("recipe_not_found", 404);
  return { value: null, outcome: "changed" };
}

/** Marks or unmarks the user's recipe as a favourite. Idempotent: marking twice keeps the first time. */
export async function setRecipeFavourite(
  ctx: WriteContext,
  id: string,
  favourite: boolean,
): Promise<WriteOutcome<null>> {
  if (!isUuid(id)) throw appError("recipe_not_found", 404);
  const changed = await ctx.db
    .update(recipes)
    .set({ favouriteAt: favourite ? sql`coalesce(${recipes.favouriteAt}, ${ctx.now})` : null })
    .where(and(eq(recipes.id, id), ownRecipe(ctx.userId)))
    .returning({ id: recipes.id });
  if (changed.length === 0) throw appError("recipe_not_found", 404);
  return { value: null, outcome: "changed" };
}

/**
 * Deletes the user's recipe, and with it its lines and tags. Nothing puts a
 * recipe on a day yet, so nothing can use one, and a delete always deletes.
 */
export async function deleteRecipe(ctx: WriteContext, id: string): Promise<WriteOutcome<null>> {
  await ctx.db.transaction(async (tx) => {
    const recipe = await lockRecipe(tx, ctx, id);
    await tx.delete(recipes).where(eq(recipes.id, recipe.id));
  });
  return { value: null, outcome: "deleted" };
}
