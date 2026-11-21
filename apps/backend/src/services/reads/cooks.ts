import {
  cookDiff,
  cookDiffers,
  entryFigures,
  type Cook,
  type CookLine,
  type DiffLine,
  type RecipeLine,
} from "@hovimestari/types";
import { and, asc, eq } from "drizzle-orm";
import { cookIngredients, cooks, entries, foodPortions, foods } from "../../db/schema/index.js";
import { appError } from "../../lib/errors.js";
import { isUuid } from "../../lib/isUuid.js";
import { entryOf, selectEntries } from "../entryRows.js";
import { portionVisibleTo } from "../foodScope.js";
import { cookBasisOf } from "../recipeValues.js";
import type { ReadContext } from "./context.js";
import { getRecipe, lineJoinColumns, lineOf } from "./recipes.js";

// A cook as the API shows it: its lines with their foods as they are now,
// its figures from the basis every entry from it carries, what it changed
// from its recipe as the recipe is now, and its entries. The figures are the
// cook's stored basis, never recomputed here, so they are always the
// figures its entries show.

/** A line as `cookDiff` compares it. */
const diffLineOf = (l: RecipeLine): DiffLine => ({
  id: l.id,
  foodId: l.food?.id ?? null,
  grams: l.grams,
  written: l.written,
  name: l.name,
});

/** The lines of the cook `cookId`, in order, with their foods read without the visibility rule. */
async function cookLinesOf(ctx: ReadContext, cookId: string): Promise<CookLine[]> {
  const rows = await ctx.db
    .select({ line: cookIngredients, ...lineJoinColumns(ctx.userId) })
    .from(cookIngredients)
    .leftJoin(foods, eq(foods.id, cookIngredients.foodId))
    .leftJoin(
      foodPortions,
      and(
        eq(foodPortions.id, cookIngredients.portionId),
        eq(foodPortions.foodId, cookIngredients.foodId),
        portionVisibleTo(ctx.userId),
      ),
    )
    .where(and(eq(cookIngredients.userId, ctx.userId), eq(cookIngredients.cookId, cookId)))
    .orderBy(asc(cookIngredients.position));
  return rows.map((r) => ({ ...lineOf(r.line, r), fromLineId: r.line.fromLineId }));
}

/**
 * The user's cook `id`: its recipe as it is now (a deleted one too), its
 * lines, its figures, what it changed from the recipe, and every entry from
 * it by date and position. Unknown or another user's: 404 `cook_not_found`.
 */
export async function getCook(ctx: ReadContext, id: string): Promise<Cook> {
  if (!isUuid(id)) throw appError("cook_not_found", 404);
  const [row] = await ctx.db
    .select()
    .from(cooks)
    .where(and(eq(cooks.id, id), eq(cooks.userId, ctx.userId)));
  if (!row) throw appError("cook_not_found", 404);
  // One statement after another, so a read on the pool holds one connection at a time.
  const recipe = await getRecipe(ctx, row.recipeId);
  const lines = await cookLinesOf(ctx, row.id);
  const entryRows = await selectEntries(ctx.db, ctx.userId, eq(entries.cookId, row.id));
  const diff = cookDiff(
    recipe.lines.map(diffLineOf),
    recipe.servings,
    lines.map((l) => ({ ...diffLineOf(l), fromLineId: l.fromLineId })),
    row.servings,
  );
  const differs = new Map([[row.id, cookDiffers(diff)]]);
  const basis = cookBasisOf(row);
  return {
    id: row.id,
    recipe: { id: recipe.id, name: recipe.name, servings: recipe.servings, deleted: recipe.deleted },
    date: row.date,
    servings: row.servings,
    lines,
    perServing: entryFigures(basis, { per: "serving", count: 1 }),
    whole: entryFigures(basis, { per: "serving", count: row.servings }),
    basis,
    diff,
    entries: entryRows.map((r) => entryOf(r, differs)),
  };
}
