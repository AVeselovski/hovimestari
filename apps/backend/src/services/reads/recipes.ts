import {
  entryFigures,
  filterRecipes,
  scaleRecipe,
  sortRecipes,
  type FineliPortionUnit,
  type FoodSource,
  type IngredientUnit,
  type Recipe,
  type RecipeFilter,
  type RecipeLine,
  type RecipePreview,
  type RecipePreviewBody,
  type RecipeSummary,
  type ScaledRecipe,
} from "@hovimestari/types";
import { and, asc, desc, eq, inArray, isNotNull, isNull, max, sql, type SQL } from "drizzle-orm";
import { entries, foodPortions, foods, recipeIngredients, recipes, recipeTags } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { byName, displayName } from "../foodRows.js";
import { portionVisibleTo } from "../foodScope.js";
import {
  basisLine,
  cappedServingBasis,
  checkLine,
  readLineFoods,
  servingBasis,
  type LineCheck,
} from "../recipeValues.js";
import type { ReadContext } from "./context.js";

// A recipe's figures are computed when it is read, from its counted lines
// and their foods as they are now, through recipeBasis: never stored, so
// never stale. A line's food is joined without the visibility rule, scoped
// by the recipe's owner, so a line keeps a food hidden or retired since.
// One person's recipes are a few hundred at most, read with their lines in
// three queries.

/** The portion hint as a line carries it: read only when it is the line's food's portion and visible. */
const hintedPortion = (userId: string) =>
  and(
    eq(foodPortions.id, recipeIngredients.portionId),
    eq(foodPortions.foodId, recipeIngredients.foodId),
    portionVisibleTo(userId),
  );

/** The columns a recipe line and a cook line share, as a line read maps them. */
type LineColumns = Pick<
  typeof recipeIngredients.$inferSelect,
  | "id"
  | "position"
  | "foodId"
  | "grams"
  | "portionCount"
  | "portionUnit"
  | "portionName"
  | "name"
  | "writtenAmount"
  | "writtenUnit"
  | "note"
>;

/** What a line read joins beside the line: its food as the app reads it, and its portion when the hint holds. */
export const lineJoinColumns = (userId: string) => ({
  foodName: displayName(userId),
  foodSource: foods.source,
  energyKcal: foods.energyKcal,
  proteinG: foods.proteinG,
  carbsG: foods.carbsG,
  fatG: foods.fatG,
  foodRetired: sql<boolean>`${foods.retiredAt} IS NOT NULL`,
  foodDeleted: sql<boolean>`${foods.deletedAt} IS NOT NULL`,
  portionId: foodPortions.id,
});

type LineJoin = {
  foodName: string;
  foodSource: FoodSource | null;
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  foodRetired: boolean;
  foodDeleted: boolean;
  portionId: string | null;
};

/** A recipe's or a cook's line row, with what it joined, as the API shows a line. */
export function lineOf(l: LineColumns, r: LineJoin): RecipeLine {
  return {
    id: l.id,
    position: l.position,
    counted: l.foodId !== null,
    food:
      l.foodId === null
        ? null
        : {
            id: l.foodId,
            name: r.foodName,
            source: r.foodSource!,
            per100g: { energyKcal: r.energyKcal!, proteinG: r.proteinG!, carbsG: r.carbsG!, fatG: r.fatG! },
            retired: r.foodRetired,
            deleted: r.foodDeleted,
          },
    name: l.name,
    grams: l.grams,
    portion:
      l.portionCount === null
        ? null
        : {
            id: r.portionId,
            unit: l.portionUnit as FineliPortionUnit | null,
            name: l.portionName,
            count: l.portionCount,
          },
    written: l.writtenAmount === null ? null : { amount: l.writtenAmount, unit: l.writtenUnit as IngredientUnit },
    note: l.note,
  };
}

/** The lines of `recipeIds`, in order, with their foods as the app reads them. */
async function linesOf(ctx: ReadContext, recipeIds: string[]): Promise<Map<string, RecipeLine[]>> {
  const rows = await ctx.db
    .select({ line: recipeIngredients, ...lineJoinColumns(ctx.userId) })
    .from(recipeIngredients)
    .leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
    .leftJoin(foodPortions, hintedPortion(ctx.userId))
    .where(and(eq(recipeIngredients.userId, ctx.userId), inArray(recipeIngredients.recipeId, recipeIds)))
    .orderBy(asc(recipeIngredients.recipeId), asc(recipeIngredients.position));
  const byRecipe = new Map<string, RecipeLine[]>();
  for (const r of rows) byRecipe.set(r.line.recipeId, [...(byRecipe.get(r.line.recipeId) ?? []), lineOf(r.line, r)]);
  return byRecipe;
}

/** The tags of `recipeIds`, each recipe's in Finnish alphabetical order. */
async function tagsOf(ctx: ReadContext, recipeIds: string[]): Promise<Map<string, string[]>> {
  const rows = await ctx.db
    .select({ recipeId: recipeTags.recipeId, tag: recipeTags.tag })
    .from(recipeTags)
    .where(and(eq(recipeTags.userId, ctx.userId), inArray(recipeTags.recipeId, recipeIds)))
    .orderBy(byName(recipeTags.tag), asc(recipeTags.tag));
  const byRecipe = new Map<string, string[]>();
  for (const r of rows) byRecipe.set(r.recipeId, [...(byRecipe.get(r.recipeId) ?? []), r.tag]);
  return byRecipe;
}

/** The latest date each of `recipeIds` is on, planned or eaten, through `entries_recipe_idx`. */
async function lastPutOnOf(ctx: ReadContext, recipeIds: string[]): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({ recipeId: entries.recipeId, last: max(entries.date) })
    .from(entries)
    .where(and(eq(entries.userId, ctx.userId), inArray(entries.recipeId, recipeIds)))
    .groupBy(entries.recipeId);
  return new Map(rows.flatMap((r) => (r.recipeId !== null && r.last !== null ? [[r.recipeId, r.last]] : [])));
}

/** The servings of the user's latest eaten entry of each of `recipeIds`, from a batch or not. */
async function lastServingsOf(ctx: ReadContext, recipeIds: string[]): Promise<Map<string, number>> {
  const rows = await ctx.db
    .selectDistinctOn([entries.recipeId], { recipeId: entries.recipeId, servings: entries.servings })
    .from(entries)
    .where(and(eq(entries.userId, ctx.userId), inArray(entries.recipeId, recipeIds), isNotNull(entries.eatenAt)))
    .orderBy(entries.recipeId, desc(entries.eatenAt), desc(entries.position));
  return new Map(rows.map((r) => [r.recipeId!, r.servings!]));
}

/** The user's recipes matching `where`, whole, in no particular order. */
async function readRecipes(ctx: ReadContext, where: SQL): Promise<Recipe[]> {
  const rows = await ctx.db
    .select()
    .from(recipes)
    .where(and(eq(recipes.userId, ctx.userId), where));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [lines, tags, lastPutOn, lastServings] = await Promise.all([
    linesOf(ctx, ids),
    tagsOf(ctx, ids),
    lastPutOnOf(ctx, ids),
    lastServingsOf(ctx, ids),
  ]);
  return rows.map((row) => {
    const recipeLines = lines.get(row.id) ?? [];
    const basis = servingBasis(recipeLines, row.servings);
    return {
      id: row.id,
      name: row.name,
      servings: row.servings,
      timeMinutes: row.timeMinutes,
      tags: tags.get(row.id) ?? [],
      favourite: row.favouriteAt !== null,
      archived: row.archivedAt !== null,
      perServing: entryFigures(basis, { per: "serving", count: 1 }),
      basis,
      lastPutOn: lastPutOn.get(row.id) ?? null,
      lastServings: lastServings.get(row.id) ?? null,
      imageId: null,
      foodsGone: recipeLines.some((l) => l.food !== null && (l.food.deleted || l.food.retired)),
      deleted: row.deletedAt !== null,
      whole: entryFigures(basis, { per: "serving", count: row.servings }),
      lines: recipeLines,
      steps: row.steps,
      notes: row.notes,
    };
  });
}

/** A recipe's summary: what a list shows. */
const summaryOf = (r: Recipe): RecipeSummary => ({
  id: r.id,
  name: r.name,
  servings: r.servings,
  timeMinutes: r.timeMinutes,
  tags: r.tags,
  favourite: r.favourite,
  archived: r.archived,
  perServing: r.perServing,
  basis: r.basis,
  lastPutOn: r.lastPutOn,
  lastServings: r.lastServings,
  imageId: r.imageId,
  foodsGone: r.foodsGone,
});

/**
 * The user's recipes, active or archived, filtered and sorted by the shared
 * functions the web runs on the device, at most `limit`. Deleted ones never.
 */
export async function listRecipes(
  ctx: ReadContext,
  filter: RecipeFilter & { limit?: number },
): Promise<RecipeSummary[]> {
  const archived = filter.archived ? isNotNull(recipes.archivedAt) : isNull(recipes.archivedAt);
  const all = (await readRecipes(ctx, and(isNull(recipes.deletedAt), archived)!)).map(summaryOf);
  const found = sortRecipes(filterRecipes(all, filter), filter.sort);
  return filter.limit === undefined ? found : found.slice(0, filter.limit);
}

/** The summaries of those of `ids` the user can log: their own, neither archived nor deleted. */
export async function loggableRecipesOf(ctx: ReadContext, ids: string[]): Promise<Map<string, RecipeSummary>> {
  if (ids.length === 0) return new Map();
  const found = await readRecipes(
    ctx,
    and(inArray(recipes.id, ids), isNull(recipes.deletedAt), isNull(recipes.archivedAt))!,
  );
  return new Map(found.map((r) => [r.id, summaryOf(r)]));
}

/**
 * One of the user's recipes, archived, or deleted while days use it, since a
 * day's entry opens it. With `servings`, also the recipe at that many
 * servings: its lines' amounts scaled and its figures from its basis.
 * Unknown or another user's: 404 `recipe_not_found`.
 */
export async function getRecipe(
  ctx: ReadContext,
  id: string,
  { servings }: { servings?: number } = {},
): Promise<Recipe & { scaled?: ScaledRecipe }> {
  if (!isUuid(id)) throw appError("recipe_not_found", 404);
  const [recipe] = await readRecipes(ctx, eq(recipes.id, id));
  if (!recipe) throw appError("recipe_not_found", 404);
  if (servings === undefined) return recipe;
  return {
    ...recipe,
    scaled: {
      servings,
      lines: scaleRecipe(recipe.lines, recipe.servings, servings),
      figures: entryFigures(recipe.basis, { per: "serving", count: servings }),
    },
  };
}

/**
 * What a draft comes to, written nowhere: every line's food as the app reads
 * it, its grams and its refusal, then the figures, or the whole draft's
 * refusal. The same check a save runs, without its locks.
 */
export async function previewRecipe(ctx: ReadContext, body: RecipePreviewBody): Promise<RecipePreview> {
  const foodIds = body.lines.flatMap((l) => (l.counted ? [l.foodId] : []));
  const lineFoods = await readLineFoods(ctx.db, ctx, foodIds, [], { lock: false });
  // One line after another, as a save checks them, so one preview holds one pooled connection at a time.
  const checks: LineCheck[] = [];
  for (const line of body.lines) checks.push(await checkLine(ctx.db, ctx, line, lineFoods));
  const lines = body.lines.map((line, index) => {
    const check = checks[index];
    const food = line.counted ? (lineFoods.get(line.foodId.toLowerCase()) ?? null) : null;
    const amount = check.checked?.amount ?? null;
    return {
      index,
      foodName: food?.name ?? null,
      grams: amount?.grams ?? null,
      portion:
        amount === null || amount.portionCount === null
          ? null
          : {
              id: amount.portionId,
              unit: amount.portionUnit as FineliPortionUnit | null,
              name: amount.portionName,
              count: amount.portionCount,
            },
      refusal: check.refusal,
    };
  });
  const none = { perServing: null, whole: null, basis: null };
  if (checks.some((c) => c.refusal !== null)) return { lines, ...none, refusal: null };
  const basis = cappedServingBasis(
    checks.map((c) => basisLine(c.checked)),
    body.servings,
  );
  if (basis === null) return { lines, ...none, refusal: "recipe_serving_too_large" };
  return {
    lines,
    perServing: entryFigures(basis, { per: "serving", count: 1 }),
    whole: entryFigures(basis, { per: "serving", count: body.servings }),
    basis,
    refusal: null,
  };
}
