import { createTestQueryClient } from "@/__tests__/helpers/queryClient";
import { detailOf, fineliFood, ownFood } from "@/components/foods/__tests__/support";
import type { FoodSearchResult } from "@hovimestari/types";
import { dropFood, putFavourite, putNewFoodInSearches, putSavedFood } from "../foodCache";
import { queryKeys } from "../queryKeys";

// A search's answer holds two lists, the foods with every word and the foods
// with all but one. A write that knows a food's new state puts it into both,
// in every cached search.

const key = queryKeys.foodSearch("oma rahka 2");
const other = queryKeys.foodSearch("rahka");

function seeded() {
  const client = createTestQueryClient();
  const quark = fineliFood("Rahka, maustamaton");
  const mine = ownFood("Oma rahka");
  const twin = ownFood("Oma rahka, toinen");
  client.setQueryData<FoodSearchResult>(key, { foods: [quark], near: [mine, twin] });
  client.setQueryData<FoodSearchResult>(other, { foods: [quark, mine], near: [] });
  const read = (k: readonly unknown[]) => client.getQueryData<FoodSearchResult>(k)!;
  return { client, quark, mine, twin, read };
}

describe("foodCache, the near list of a cached search", () => {
  it("renames a saved own food in the near list, and where it is among the foods", () => {
    const { client, mine, twin, quark, read } = seeded();
    putSavedFood(client, detailOf({ ...mine, name: "Oma maitorahka" }));
    expect(read(key).near.map((f) => f.name)).toEqual(["Oma maitorahka", twin.name]);
    expect(read(key).foods).toEqual([quark]);
    expect(read(other).foods.map((f) => f.name)).toEqual([quark.name, "Oma maitorahka"]);
  });

  it("drops a deleted food from the near list and leaves the rest in their order", () => {
    const { client, mine, twin, quark, read } = seeded();
    dropFood(client, mine.id);
    expect(read(key)).toEqual({ foods: [quark], near: [twin] });
    expect(read(other)).toEqual({ foods: [quark], near: [] });
  });

  it("flips a favourite's star in the near list", () => {
    const { client, twin, read } = seeded();
    putFavourite(client, twin, true);
    expect(read(key).near.map((f) => f.isFavourite)).toEqual([false, true]);
    putFavourite(client, twin, false);
    expect(read(key).near.map((f) => f.isFavourite)).toEqual([false, false]);
  });

  it("leaves an answer that holds no row of the food as the object it was", () => {
    const { client, read } = seeded();
    const before = read(key);
    dropFood(client, fineliFood("Kaurahiutale").id);
    expect(read(key)).toBe(before);
  });

  it("puts a new own food among the foods of the search for its name, and keeps the near foods under it", () => {
    const client = createTestQueryClient();
    const near = fineliFood("Rahka, maustamaton");
    const made = detailOf(ownFood("Oma rahka 2"));
    client.setQueryData<FoodSearchResult>(key, { foods: [], near: [near] });
    expect(putNewFoodInSearches(client, made).size).toBe(1);
    const held = client.getQueryData<FoodSearchResult>(key)!;
    expect(held.foods.map((f) => f.id)).toEqual([made.id]);
    expect(held.near).toEqual([near]);
  });

  it("takes a food renamed to the searched text out of the near list as it goes among the foods", () => {
    const client = createTestQueryClient();
    const other = fineliFood("Rahka, maustamaton");
    const mine = ownFood("Oma rahka");
    client.setQueryData<FoodSearchResult>(key, { foods: [], near: [mine, other] });
    const renamed = detailOf({ ...mine, name: "Oma rahka 2" });
    putSavedFood(client, renamed);
    putNewFoodInSearches(client, renamed);
    const held = client.getQueryData<FoodSearchResult>(key)!;
    expect(held.foods.map((f) => [f.id, f.name])).toEqual([[mine.id, "Oma rahka 2"]]);
    // A food is never in both lists.
    expect(held.near).toEqual([other]);
  });
});
