import { EGG, recipeOf, shakshuka } from "@/components/recipes/__tests__/recipeFixtures";
import { afterRecipeGone } from "@/lib/invalidation";
import { queryKeys } from "@/lib/queryKeys";
import { dropRecipe, moveRecipe, putRecipe, putRecipeFavourite, recipeSummaryOf } from "@/lib/recipeCache";
import type { RecentList, Recipe, RecipeList } from "@hovimestari/types";
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

  describe("a recipe among the recent items", () => {
    const quark = {
      kind: "food" as const,
      food: {
        id: "00000000-0000-4000-8000-0000000000c1",
        name: "Quark",
        otherName: null,
        source: "fineli" as const,
        per100g: { energyKcal: 60, proteinG: 10, carbsG: 4, fatG: 0.2 },
        isFavourite: false,
        isOwn: false,
        retired: false,
      },
      last: { grams: 250, portion: null },
    };
    function withRecents(shak: Recipe): QueryClient {
      const client = seeded([shak]);
      client.setQueryData<RecentList>(queryKeys.recents(), {
        items: [quark, { kind: "recipe", recipe: recipeSummaryOf(shak), last: { servings: 1.5 } }],
      });
      return client;
    }
    const recents = (client: QueryClient) => client.getQueryData<RecentList>(queryKeys.recents())!.items;

    it("takes an edit and a favourite mark in place, keeping its last servings and its place", () => {
      const shak = shakshuka({ lastServings: 1.5 });
      const client = withRecents(shak);
      putRecipe(client, { ...shak, name: "Shakshuka, spicy" });
      putRecipeFavourite(client, shak.id, true);
      expect(recents(client)).toHaveLength(2);
      expect(recents(client)[0]).toEqual(quark);
      expect(recents(client)[1]).toMatchObject({
        kind: "recipe",
        recipe: { id: shak.id, name: "Shakshuka, spicy", favourite: true },
        last: { servings: 1.5 },
      });
    });

    it("leaves them when it is archived, as the server leaves it out, and when it is deleted", () => {
      const shak = shakshuka({ lastServings: 1.5 });
      const archived = withRecents(shak);
      moveRecipe(archived, shak.id, true);
      expect(recents(archived)).toEqual([quark]);
      // A restore puts nothing back: the next read of the recent items does.
      moveRecipe(archived, shak.id, false);
      expect(recents(archived)).toEqual([quark]);
      const deleted = withRecents(shak);
      dropRecipe(deleted, shak.id);
      expect(recents(deleted)).toEqual([quark]);
    });

    it("writes nothing to them when the write is about a recipe that is not among them", () => {
      const shak = shakshuka({ lastServings: 1.5 });
      const client = withRecents(shak);
      const before = client.getQueryData<RecentList>(queryKeys.recents());
      // Every write to the recent items that reaches those who watch them.
      let writes = 0;
      const stop = client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.query.queryHash === JSON.stringify(queryKeys.recents())) writes += 1;
      });
      const other = "00000000-0000-4000-8000-00000000aaaa";
      putRecipeFavourite(client, other, true);
      dropRecipe(client, other);
      moveRecipe(client, other, true);
      expect(writes).toBe(0);
      expect(client.getQueryData<RecentList>(queryKeys.recents())).toBe(before);
      // A write about the recipe that is among them is written.
      putRecipeFavourite(client, shak.id, true);
      expect(writes).toBe(1);
      stop();
    });
  });
});
