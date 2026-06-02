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
          { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
          { name: "Tomaattimurska", amount: 1, unit: "tlk", category: "pantry" },
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
          { name: "Pasta", amount: 200, unit: "g", category: "pantry" },
          { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        ],
        instructions: [],
      },
    ],
    stapleGroups: [
      { id: "weekly", name: "Viikko", enabled: true, order: 0, suppress: false },
      { id: "brunch", name: "Brunssi", enabled: false, order: 1, suppress: false },
    ],
    staples: [
      { id: "s1", groupId: "weekly", name: "Maito", amount: 1, unit: "l", category: "dairy", enabled: true },
      { id: "s2", groupId: "weekly", name: "Kahvi", amount: 1, unit: "pss", category: "pantry", enabled: false },
      { id: "s3", groupId: "brunch", name: "Pekoni", amount: 1, unit: "pkt", category: "meat-fish", enabled: true },
    ],
    plan: { selectedRecipes: [] },
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
    s.plan.selectedRecipes = [
      { recipeId: "r1", servings: 4 },
      { recipeId: "r2", servings: 4 },
    ];
    const list = buildShoppingList(s);
    const pantry = list.find((g) => g.id === "pantry");
    const pasta = pantry?.items.find((i) => i.name === "Pasta");
    expect(pasta?.display).toBe("400 g + 200 g");
  });

  it("groups by aisle in S-Kaupat order", () => {
    const s = baseState();
    s.plan.selectedRecipes = [
      { recipeId: "r1", servings: 4 },
      { recipeId: "r2", servings: 4 },
    ];
    s.stapleGroups[1].enabled = true; // turn brunch on for meat-fish
    const list = buildShoppingList(s);
    const order = list.map((g) => g.id);
    // produce comes before meat-fish, which comes before dairy, then pantry.
    expect(order.indexOf("produce")).toBeLessThan(order.indexOf("meat-fish"));
    expect(order.indexOf("meat-fish")).toBeLessThan(order.indexOf("dairy"));
    expect(order.indexOf("dairy")).toBeLessThan(order.indexOf("pantry"));
  });

  it("merges same-unit duplicates into 'X + Y' with unit preserved in display", () => {
    const s = baseState();
    // Add a recipe that contributes another Maito in litres (matches staple unit).
    s.recipes.push({
      id: "r3",
      name: "Maitojuoma",
      time: 5,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Maito", amount: 2, unit: "l", category: "dairy" },
      ],
      instructions: [],
    });
    s.plan.selectedRecipes = [{ recipeId: "r3", servings: 4 }];
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const maito = dairy?.items.find((i) => i.name === "Maito");
    expect(maito?.display).toBe("1 l + 2 l");
  });

  it("merges mixed-unit duplicates inline (each contributor carries its own unit)", () => {
    const s = baseState();
    s.recipes.push({
      id: "r4",
      name: "Lettutaikina",
      time: 5,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Maito", amount: 2, unit: "dl", category: "dairy" },
      ],
      instructions: [],
    });
    s.plan.selectedRecipes = [{ recipeId: "r4", servings: 4 }];
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const maito = dairy?.items.find((i) => i.name === "Maito");
    expect(maito?.display).toBe("1 l + 2 dl");
  });

  it("three-way mixed merge keeps inlining units per contributor", () => {
    const s = baseState();
    s.recipes.push({
      id: "r5",
      name: "Maitokerma",
      time: 5,
      servings: 4,
      category: "common",
      ingredients: [
        { name: "Maito", amount: 2, unit: "dl", category: "dairy" },
        { name: "Maito", amount: 100, unit: "ml", category: "dairy" },
      ],
      instructions: [],
    });
    s.plan.selectedRecipes = [{ recipeId: "r5", servings: 4 }];
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const maito = dairy?.items.find((i) => i.name === "Maito");
    expect(maito?.display).toBe("1 l + 2 dl + 100 ml");
  });

  it("produces stable category::name keys across re-derivations", () => {
    const s = baseState();
    s.plan.selectedRecipes = [
      { recipeId: "r1", servings: 4 },
      { recipeId: "r2", servings: 4 },
    ];
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
    s.plan.selectedRecipes = [
      { recipeId: "r1", servings: 4 },
      { recipeId: "r2", servings: 4 },
    ];
    s.stapleGroups[1].enabled = true;
    s.staples.push({
      id: "x1",
      groupId: "weekly",
      name: "Ärtsy",
      amount: 1,
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

  // -- New: scaling cases ----------------------------------------------------

  it("scales recipe ingredients by plan-recipe servings (C1: 4 → 6 doubles to 600 g)", () => {
    const s: State = {
      recipes: [
        {
          id: "lohi",
          name: "Lohikeitto",
          time: 25,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Lohifilee", amount: 400, unit: "g", category: "meat-fish" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: { selectedRecipes: [{ recipeId: "lohi", servings: 6 }] },
    };
    const list = buildShoppingList(s);
    const meat = list.find((g) => g.id === "meat-fish");
    const lohi = meat?.items.find((i) => i.name === "Lohifilee");
    expect(lohi?.display).toBe("600 g");
  });

  it("merges two scaled recipes contributing the same ingredient (C2: 600 g + 500 g)", () => {
    const s: State = {
      recipes: [
        {
          id: "a",
          name: "A",
          time: 20,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Lohifilee", amount: 400, unit: "g", category: "meat-fish" },
          ],
          instructions: [],
        },
        {
          id: "b",
          name: "B",
          time: 20,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Lohifilee", amount: 500, unit: "g", category: "meat-fish" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: {
        selectedRecipes: [
          { recipeId: "a", servings: 6 },
          { recipeId: "b", servings: 4 },
        ],
      },
    };
    const list = buildShoppingList(s);
    const meat = list.find((g) => g.id === "meat-fish");
    const lohi = meat?.items.find((i) => i.name === "Lohifilee");
    expect(lohi?.display).toBe("600 g + 500 g");
  });

  it("staples never scale (C4: banaani 6 kpl regardless of plan servings)", () => {
    const s: State = {
      recipes: [
        {
          id: "x",
          name: "X",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Banaani", amount: 2, unit: "kpl", category: "produce" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [{ id: "weekly", name: "Viikko", enabled: true, order: 0, suppress: false }],
      staples: [
        {
          id: "w-banaani",
          groupId: "weekly",
          name: "Banaani",
          amount: 6,
          unit: "kpl",
          category: "produce",
          enabled: true,
        },
      ],
      plan: { selectedRecipes: [{ recipeId: "x", servings: 8 }] },
    };
    const list = buildShoppingList(s);
    const produce = list.find((g) => g.id === "produce");
    const banaani = produce?.items.find((i) => i.name === "Banaani");
    // staple "6 kpl" merges with recipe "2 kpl × 8/4 = 4 kpl" → "6 kpl + 4 kpl".
    expect(banaani?.display).toBe("6 kpl + 4 kpl");
  });

  it("rounds up countable units after scaling (1 pkt × 1.5 → 2 pkt)", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Härkis", amount: 1, unit: "pkt", category: "frozen" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 6 }] },
    };
    const list = buildShoppingList(s);
    const frozen = list.find((g) => g.id === "frozen");
    const harkis = frozen?.items.find((i) => i.name === "Härkis");
    expect(harkis?.display).toBe("2 pkt");
  });

  it("keeps decimal amounts for non-countable units after scaling (400 g × 1.5 → 600 g)", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Jauheliha", amount: 400, unit: "g", category: "meat-fish" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 6 }] },
    };
    const list = buildShoppingList(s);
    const meat = list.find((g) => g.id === "meat-fish");
    const j = meat?.items.find((i) => i.name === "Jauheliha");
    expect(j?.display).toBe("600 g");
  });

  it("mixes round-up countable with raw countable in merge (1 pkt × 1.5 + 1 pkt → '2 pkt + 1 pkt')", () => {
    const s: State = {
      recipes: [
        {
          id: "a",
          name: "A",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
        {
          id: "b",
          name: "B",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: {
        selectedRecipes: [
          { recipeId: "a", servings: 6 },
          { recipeId: "b", servings: 4 },
        ],
      },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const voi = dairy?.items.find((i) => i.name === "Voi");
    expect(voi?.display).toBe("2 pkt + 1 pkt");
  });

  it("renders a null-amount contributor as unit-only when unit is non-empty", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Suolaa", amount: null, unit: "ripaus", category: "pantry" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const pantry = list.find((g) => g.id === "pantry");
    const suolaa = pantry?.items.find((i) => i.name === "Suolaa");
    expect(suolaa?.display).toBe("ripaus");
  });

  it("renders a null-amount contributor with empty unit as empty display", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Maku", amount: null, unit: "", category: "pantry" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const pantry = list.find((g) => g.id === "pantry");
    const maku = pantry?.items.find((i) => i.name === "Maku");
    expect(maku?.display).toBe("");
  });

  // -- New: Kaapista suppression cases --------------------------------------

  it("suppresses a recipe ingredient when Kaapista has a matching disabled staple", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [
        { id: "kaapista", name: "Kaapista", enabled: true, order: 0, suppress: true },
      ],
      staples: [
        { id: "k-voi", groupId: "kaapista", name: "Voi", amount: 1, unit: "pkt", category: "dairy", enabled: false },
      ],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    expect(dairy).toBeUndefined();
  });

  it("does NOT suppress when Kaapista staple is enabled (Loppu — osta)", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [
        { id: "kaapista", name: "Kaapista", enabled: true, order: 0, suppress: true },
      ],
      staples: [
        { id: "k-voi", groupId: "kaapista", name: "Voi", amount: 1, unit: "pkt", category: "dairy", enabled: true },
      ],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const voi = dairy?.items.find((i) => i.name === "Voi");
    expect(voi?.display).toBe("1 pkt + 1 pkt");
  });

  it("does NOT suppress when the Kaapista group itself is disabled", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [
        { id: "kaapista", name: "Kaapista", enabled: false, order: 0, suppress: true },
      ],
      staples: [
        { id: "k-voi", groupId: "kaapista", name: "Voi", amount: 1, unit: "pkt", category: "dairy", enabled: false },
      ],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const voi = dairy?.items.find((i) => i.name === "Voi");
    expect(voi?.display).toBe("1 pkt");
  });

  it("suppresses staples from non-suppress groups too", () => {
    const s: State = {
      recipes: [],
      stapleGroups: [
        { id: "weekly", name: "Viikko", enabled: true, order: 0, suppress: false },
        { id: "kaapista", name: "Kaapista", enabled: true, order: 1, suppress: true },
      ],
      staples: [
        { id: "w-maito", groupId: "weekly", name: "Maito", amount: 1, unit: "l", category: "dairy", enabled: true },
        { id: "k-maito", groupId: "kaapista", name: "Maito", amount: 1, unit: "l", category: "dairy", enabled: false },
      ],
      plan: { selectedRecipes: [] },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    expect(dairy).toBeUndefined();
  });

  it("matches case-insensitively and trim-insensitively", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "  voi  ", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [
        { id: "kaapista", name: "Kaapista", enabled: true, order: 0, suppress: true },
      ],
      staples: [
        { id: "k-voi", groupId: "kaapista", name: "Voi", amount: 1, unit: "pkt", category: "dairy", enabled: false },
      ],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    expect(dairy).toBeUndefined();
  });

  it("scopes suppression by category (Kaapista pantry-Voi does not suppress dairy-Voi)", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 5,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [
        { id: "kaapista", name: "Kaapista", enabled: true, order: 0, suppress: true },
      ],
      staples: [
        { id: "k-voi", groupId: "kaapista", name: "Voi", amount: 1, unit: "pkt", category: "pantry", enabled: false },
      ],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 4 }] },
    };
    const list = buildShoppingList(s);
    const dairy = list.find((g) => g.id === "dairy");
    const voi = dairy?.items.find((i) => i.name === "Voi");
    expect(voi?.display).toBe("1 pkt");
  });

  it("editing a recipe's servings does not mutate PlanRecipe.servings (C5: decoupling)", () => {
    const s: State = {
      recipes: [
        {
          id: "r",
          name: "R",
          time: 20,
          servings: 4,
          category: "common",
          ingredients: [
            { name: "Jauheliha", amount: 400, unit: "g", category: "meat-fish" },
          ],
          instructions: [],
        },
      ],
      stapleGroups: [],
      staples: [],
      plan: { selectedRecipes: [{ recipeId: "r", servings: 6 }] },
    };
    // First build: 6/4 = 1.5 scale → 600 g.
    const before = buildShoppingList(s);
    expect(
      before.find((g) => g.id === "meat-fish")?.items.find((i) => i.name === "Jauheliha")
        ?.display,
    ).toBe("600 g");
    // Simulate the user editing the recipe's base servings to 2.
    s.recipes[0].servings = 2;
    const after = buildShoppingList(s);
    // Scale is now 6/2 = 3 → 1200 g; the PlanRecipe.servings was untouched.
    expect(
      after.find((g) => g.id === "meat-fish")?.items.find((i) => i.name === "Jauheliha")
        ?.display,
    ).toBe("1200 g");
    expect(s.plan.selectedRecipes[0].servings).toBe(6);
  });
});
