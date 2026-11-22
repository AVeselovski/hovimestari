import type { RecentItem, RecentList, Recipe, RecipeList, RecipeSummary } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// A recipe write's own answer, put into the cached reads in place, before
// they are read again (lib/invalidation.ts). A row keeps its place in every
// list, so a list under the thumb never re-orders while it is on screen, and
// the recipe's page shows the answer the moment the editor closes. A recipe
// among the recent items is edited in place too, and leaves them when it is
// archived or gone, as the server leaves it out.
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

/** Each recent recipe as `edit` gives it, in place. Null takes it out. The recipe it was given back leaves it as it is. */
function editRecents(client: QueryClient, edit: (recipe: RecipeSummary) => RecipeSummary | null): void {
  client.setQueryData<RecentList>(queryKeys.recents(), (list) => {
    if (!list) return list;
    let changed = false;
    const items = list.items.flatMap((item): RecentItem[] => {
      if (item.kind !== "recipe") return [item];
      const recipe = edit(item.recipe);
      if (recipe === item.recipe) return [item];
      changed = true;
      return recipe === null ? [] : [{ ...item, recipe }];
    });
    // Nothing is written when no recent recipe changed (an updater that gives undefined writes nothing), so
    // nothing that watches the recent items hears of it.
    return changed ? { items } : undefined;
  });
}

/** A saved recipe: its page shows the answer, and its row is replaced in place, or a new one joins the active list. */
export function putRecipe(client: QueryClient, recipe: Recipe): void {
  client.setQueryData(queryKeys.recipeDetail(recipe.id), recipe);
  const row = recipeSummaryOf(recipe);
  editLists(client, (rows) => rows.map((r) => (r.id === recipe.id ? row : r)));
  editRecents(client, (r) => (r.id === recipe.id ? row : r));
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
  editRecents(client, (r) => (r.id === id ? { ...r, favourite } : r));
}

/**
 * An archived recipe leaves the active list and joins the archived one, and
 * a restored one the other way, so either list shows it right away. Its page
 * reads as archived or not. An archived recipe leaves the recent items.
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
  if (archived) editRecents(client, (r) => (r.id === id ? null : r));
}

/** A deleted recipe, or one found gone, leaves both lists and the recent items. */
export function dropRecipe(client: QueryClient, id: string): void {
  editLists(client, (rows) => rows.filter((r) => r.id !== id));
  editRecents(client, (r) => (r.id === id ? null : r));
}
