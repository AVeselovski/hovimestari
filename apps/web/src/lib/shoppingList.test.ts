import { describe, it, expect } from "vitest";
import type { State } from "@hovi/shared";
import { buildShoppingList } from "./shoppingList.js";

function baseState(): State {
  return {
    recipes: [
      {
        id: "r1",
        name: "Pasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: "400", unit: "g", category: "pantry" },
          { name: "Tomaattimurska", amount: "1", unit: "tlk", category: "pantry" },
        ],
        instructions: [],
      },
      {
        id: "r2",
        name: "Curry",
        time: 25,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: "200", unit: "g", category: "pantry" },
          { name: "Sipuli", amount: "1", unit: "kpl", category: "produce" },
        ],
        instructions: [],
      },
    ],
    stapleGroups: [
      { id: "weekly", name: "Viikko", enabled: true, order: 0 },
      { id: "brunch", name: "Brunssi", enabled: false, order: 1 },
    ],
    staples: [
      { id: "s1", groupId: "weekly", name: "Maito", amount: "1", unit: "l", category: "dairy", enabled: true },
      { id: "s2", groupId: "weekly", name: "Kahvi", amount: "1", unit: "pss", category: "pantry", enabled: false },
      { id: "s3", groupId: "brunch", name: "Pekoni", amount: "1", unit: "pkt", category: "meat-fish", enabled: true },
    ],
    plan: { selectedRecipeIds: [] },
  };
}

describe("buildShoppingList", () => {
  it("includes only enabled staples in enabled groups", () => {
    const s = baseState();
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    expect(dairy?.items.map((i) => i.name)).toEqual(["Maito"]);
    // Pekoni (brunch group, disabled) should be excluded.
    expect(list.find((g) => g.id === "meat-fish")).toBeUndefined();
    // Kahvi (disabled staple) excluded.
    const pantry = list.find((g) => g.id === "pantry");
    expect(pantry).toBeUndefined();
  });

  it("merges duplicate (category,name) across recipes by concatenating amounts", () => {
    const s = baseState();
    s.plan.selectedRecipeIds = ["r1", "r2"];
    const list = buildShoppingList(s);
    const pantry = list.find((g) => g.id === "pantry");
    const pasta = pantry?.items.find((i) => i.name === "Pasta");
    expect(pasta?.amount).toBe("400 + 200");
  });

  it("groups by aisle in S-Kaupat order", () => {
    const s = baseState();
    s.plan.selectedRecipeIds = ["r1", "r2"];
    s.stapleGroups[1].enabled = true; // turn brunch on for meat-fish
    const list = buildShoppingList(s);
    const order = list.map((g) => g.id);
    // produce comes before meat-fish, which comes before dairy, then pantry.
    expect(order.indexOf("produce")).toBeLessThan(order.indexOf("meat-fish"));
    expect(order.indexOf("meat-fish")).toBeLessThan(order.indexOf("dairy"));
    expect(order.indexOf("dairy")).toBeLessThan(order.indexOf("pantry"));
  });

  it("merges same-unit duplicates into 'X + Y' with unit preserved", () => {
    const s = baseState();
    // Add a recipe that contributes another Maito in litres (matches staple unit).
    s.recipes.push({
      id: "r3",
      name: "Maitojuoma",
      time: 5,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Maito", amount: "2", unit: "l", category: "dairy" },
      ],
      instructions: [],
    });
    s.plan.selectedRecipeIds = ["r3"];
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const maito = dairy?.items.find((i) => i.name === "Maito");
    expect(maito?.amount).toBe("1 + 2");
    expect(maito?.unit).toBe("l");
  });

  it("merges mixed-unit duplicates inline (amount carries both units, unit cleared)", () => {
    const s = baseState();
    // Recipe contributes Maito in dl; staple has Maito in l.
    s.recipes.push({
      id: "r4",
      name: "Lettutaikina",
      time: 5,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Maito", amount: "2", unit: "dl", category: "dairy" },
      ],
      instructions: [],
    });
    s.plan.selectedRecipeIds = ["r4"];
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const maito = dairy?.items.find((i) => i.name === "Maito");
    expect(maito?.amount).toBe("1 l + 2 dl");
    expect(maito?.unit).toBe("");
  });

  it("three-way mixed merge keeps inlining units", () => {
    const s = baseState();
    s.recipes.push({
      id: "r5",
      name: "Maitokerma",
      time: 5,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Maito", amount: "2", unit: "dl", category: "dairy" },
        { name: "Maito", amount: "100", unit: "ml", category: "dairy" },
      ],
      instructions: [],
    });
    s.plan.selectedRecipeIds = ["r5"];
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const maito = dairy?.items.find((i) => i.name === "Maito");
    expect(maito?.amount).toBe("1 l + 2 dl + 100 ml");
    expect(maito?.unit).toBe("");
  });

  it("produces stable category::name keys across re-derivations", () => {
    const s = baseState();
    s.plan.selectedRecipeIds = ["r1", "r2"];
    s.stapleGroups[1].enabled = true;
    const a = buildShoppingList(s);
    const b = buildShoppingList(s);
    const keysFrom = (
      list: ReturnType<typeof buildShoppingList>,
    ): string[] =>
      list.flatMap((g) => g.items.map((it) => `${g.id}::${it.name}`));
    expect(keysFrom(a)).toEqual(keysFrom(b));
  });

  it("sorts items within a group alphabetically (Finnish locale)", () => {
    const s = baseState();
    s.plan.selectedRecipeIds = ["r1", "r2"];
    s.stapleGroups[1].enabled = true;
    s.staples.push({
      id: "x1",
      groupId: "weekly",
      name: "Ärtsy",
      amount: "1",
      unit: "kpl",
      category: "produce",
      enabled: true,
    });
    const list = buildShoppingList(s);
    const produce = list.find((g) => g.id === "produce");
    const names = produce?.items.map((i) => i.name);
    // Sipuli before Ärtsy in Finnish: ä sorts after z.
    expect(names).toEqual(["Sipuli", "Ärtsy"]);
  });
});
