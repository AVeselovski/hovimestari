import { api, type RequestOptions } from "@/lib/api";
import type { Recipe, RecipeBody, RecipeEditBody, RecipeList } from "@hovimestari/types";

/**
 * `GET /recipes`: the user's active recipes, or with `archived` the archived
 * ones. The app sends no filter: it filters and sorts on the device with the
 * shared `filterRecipes` and `sortRecipes`.
 */
export async function getRecipes(archived: boolean, req?: RequestOptions): Promise<RecipeList> {
  const res = await api.get<RecipeList>("/recipes", {
    params: archived ? { archived: "true" } : undefined,
    signal: req?.signal,
  });
  return res.data;
}

/** `GET /recipes/:id`: one recipe with its lines, archived or deleted too, since a day's entry opens it. */
export async function getRecipe(id: string, req?: RequestOptions): Promise<Recipe> {
  const res = await api.get<Recipe>(`/recipes/${id}`, { signal: req?.signal });
  return res.data;
}

/**
 * `POST /recipes`: saves a recipe with the id the app chose. Sent again with
 * the same id, it answers the recipe it saved the first time.
 */
export async function createRecipe(body: RecipeBody): Promise<Recipe> {
  const res = await api.post<Recipe>("/recipes", body);
  return res.data;
}

/**
 * `PUT /recipes/:id`: the whole recipe. A field left out is cleared, so the
 * editor always sends every field. A line sent under an id the recipe does
 * not hold may come back under the id of an identical line it holds.
 */
export async function updateRecipe(id: string, body: RecipeEditBody): Promise<Recipe> {
  const res = await api.put<Recipe>(`/recipes/${id}`, body);
  return res.data;
}

/** `PUT` or `DELETE /recipes/:id/archived`: archives or restores a recipe, also when it already is. */
export async function setRecipeArchived(id: string, archived: boolean): Promise<void> {
  if (archived) await api.put(`/recipes/${id}/archived`);
  else await api.delete(`/recipes/${id}/archived`);
}

/** `PUT` or `DELETE /recipes/:id/favourite`: marks a recipe as a favourite or clears the mark. */
export async function setRecipeFavourite(id: string, favourite: boolean): Promise<void> {
  if (favourite) await api.put(`/recipes/${id}/favourite`);
  else await api.delete(`/recipes/${id}/favourite`);
}

/** `DELETE /recipes/:id`: deletes a recipe. Days it was on keep their figures. */
export async function deleteRecipe(id: string): Promise<void> {
  await api.delete(`/recipes/${id}`);
}
