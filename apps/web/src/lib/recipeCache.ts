import type { Recipe, RecipeList, RecipeSummary } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// A recipe write's own answer, put into the cached reads in place, before
// they are read again (lib/invalidation.ts). A row keeps its place in every
// list, so a list under the thumb never re-orders while it is on screen, and
// the recipe's page shows the answer the moment the editor closes.
// ---------------------------------------------------------------------------

const LISTS = [queryKeys.recipeList(false), queryKeys.recipeList(true)] as const;

/** A recipe as a list shows it, from the recipe. */
export function recipeSummaryOf(recipe: Recipe): RecipeSummary {
  const {
    id,
    name,
    servings,
    timeMinutes,
    tags,
    favourite,
    archived,
    perServing,
    basis,
    lastPutOn,
    lastServings,
    imageId,
    foodsGone,
  } = recipe;
  return {
    id,
    name,
    servings,
    timeMinutes,
    tags,
    favourite,
    archived,
    perServing,
    basis,
    lastPutOn,
    lastServings,
    imageId,
    foodsGone,
  };
}

function editLists(client: QueryClient, edit: (recipes: RecipeSummary[]) => RecipeSummary[]): void {
  for (const key of LISTS) {
    client.setQueryData<RecipeList>(key, (list) => (list ? { recipes: edit(list.recipes) } : list));
  }
}

/** A saved recipe: its page shows the answer, and its row is replaced in place, or a new one joins the active list. */
export function putRecipe(client: QueryClient, recipe: Recipe): void {
  client.setQueryData(queryKeys.recipeDetail(recipe.id), recipe);
  const row = recipeSummaryOf(recipe);
  editLists(client, (rows) => rows.map((r) => (r.id === recipe.id ? row : r)));
  client.setQueryData<RecipeList>(queryKeys.recipeList(false), (list) =>
    !list || recipe.archived || list.recipes.some((r) => r.id === recipe.id)
      ? list
      : { recipes: [...list.recipes, row] },
  );
}

/** A recipe's favourite mark, in its row and on its page, at once. */
export function putRecipeFavourite(client: QueryClient, id: string, favourite: boolean): void {
  client.setQueryData<Recipe>(queryKeys.recipeDetail(id), (r) => (r ? { ...r, favourite } : r));
  editLists(client, (rows) => rows.map((r) => (r.id === id ? { ...r, favourite } : r)));
}

/**
 * An archived recipe leaves the active list and joins the archived one, and
 * a restored one the other way, so either list shows it right away. Its page
 * reads as archived or not.
 */
export function moveRecipe(client: QueryClient, id: string, archived: boolean): void {
  const from = queryKeys.recipeList(!archived);
  const row = client.getQueryData<RecipeList>(from)?.recipes.find((r) => r.id === id);
  client.setQueryData<RecipeList>(from, (list) => (list ? { recipes: list.recipes.filter((r) => r.id !== id) } : list));
  if (row) {
    client.setQueryData<RecipeList>(queryKeys.recipeList(archived), (list) =>
      !list || list.recipes.some((r) => r.id === id) ? list : { recipes: [...list.recipes, { ...row, archived }] },
    );
  }
  client.setQueryData<Recipe>(queryKeys.recipeDetail(id), (r) => (r ? { ...r, archived } : r));
}

/** A deleted recipe, or one found gone, leaves both lists. */
export function dropRecipe(client: QueryClient, id: string): void {
  editLists(client, (rows) => rows.filter((r) => r.id !== id));
}
