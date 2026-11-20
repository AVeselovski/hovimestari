import { EGG, recipeOf, shakshuka } from "@/components/recipes/__tests__/recipeFixtures";
import { afterRecipeGone } from "@/lib/invalidation";
import { queryKeys } from "@/lib/queryKeys";
import { dropRecipe, moveRecipe, putRecipe, putRecipeFavourite, recipeSummaryOf } from "@/lib/recipeCache";
import type { Recipe, RecipeList } from "@hovimestari/types";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

// A recipe write's answer goes into the cached lists and the recipe's page
// in place, before any read.

function seeded(active: Recipe[], archived: Recipe[] = []): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<RecipeList>(queryKeys.recipeList(false), { recipes: active.map(recipeSummaryOf) });
  client.setQueryData<RecipeList>(queryKeys.recipeList(true), { recipes: archived.map(recipeSummaryOf) });
  return client;
}
const names = (client: QueryClient, archived: boolean) =>
  client.getQueryData<RecipeList>(queryKeys.recipeList(archived))!.recipes.map((r) => r.name);

describe("the recipe cache", () => {
  it("replaces an edited recipe's row in place and puts the answer on its page", () => {
    const shak = shakshuka();
    const omelette = recipeOf("Omelette", 1, [{ food: EGG, grams: 120 }]);
    const client = seeded([omelette, shak]);
    const edited = { ...shak, name: "Shakshuka, spicy" };
    putRecipe(client, edited);
    expect(names(client, false)).toEqual(["Omelette", "Shakshuka, spicy"]);
    expect(client.getQueryData<Recipe>(queryKeys.recipeDetail(shak.id))).toEqual(edited);
    // A row holds the summary only, never the lines.
    expect(client.getQueryData<RecipeList>(queryKeys.recipeList(false))!.recipes[1]).not.toHaveProperty("lines");
  });

  it("adds a new recipe to the active list once", () => {
    const client = seeded([]);
    const shak = shakshuka();
    putRecipe(client, shak);
    putRecipe(client, shak);
    expect(names(client, false)).toEqual(["Shakshuka"]);
  });

  it("moves an archived recipe to the archived list and back, and marks its page", () => {
    const shak = shakshuka();
    const client = seeded([shak]);
    client.setQueryData(queryKeys.recipeDetail(shak.id), shak);
    moveRecipe(client, shak.id, true);
    expect(names(client, false)).toEqual([]);
    expect(names(client, true)).toEqual(["Shakshuka"]);
    expect(client.getQueryData<Recipe>(queryKeys.recipeDetail(shak.id))!.archived).toBe(true);
    moveRecipe(client, shak.id, false);
    expect(names(client, false)).toEqual(["Shakshuka"]);
    expect(names(client, true)).toEqual([]);
  });

  it("marks a favourite in its row and on its page at once", () => {
    const shak = shakshuka();
    const client = seeded([shak]);
    client.setQueryData(queryKeys.recipeDetail(shak.id), shak);
    putRecipeFavourite(client, shak.id, true);
    expect(client.getQueryData<RecipeList>(queryKeys.recipeList(false))!.recipes[0].favourite).toBe(true);
    expect(client.getQueryData<Recipe>(queryKeys.recipeDetail(shak.id))!.favourite).toBe(true);
  });

  it("drops a deleted recipe from both lists, and leaves its page to be read afresh, not now", async () => {
    const shak = shakshuka();
    const client = seeded([shak], [recipeOf("Old", 1, [{ name: "Water" }])]);
    client.setQueryData(queryKeys.recipeDetail(shak.id), shak);
    const read = jest.fn().mockResolvedValue(shak);
    // An observer, as the page leaving still holds one.
    const unsubscribe = new QueryObserver(client, {
      queryKey: queryKeys.recipeDetail(shak.id),
      queryFn: read,
      staleTime: Infinity,
    }).subscribe(() => {});
    dropRecipe(client, shak.id);
    expect(names(client, false)).toEqual([]);
    await afterRecipeGone(client, shak.id);
    expect(read).not.toHaveBeenCalled();
    expect(client.getQueryState(queryKeys.recipeDetail(shak.id))!.isInvalidated).toBe(true);
    unsubscribe();
  });
});
