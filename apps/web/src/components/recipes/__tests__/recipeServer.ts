import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipes,
  setRecipeArchived,
  setRecipeFavourite,
  updateRecipe,
} from "@/lib/api/recipes";
import { recipeSummaryOf } from "@/lib/recipeCache";
import {
  gramsForPortion,
  type FineliPortionUnit,
  type IngredientLineBody,
  type Recipe,
  type RecipeBody,
  type RecipeEditBody,
  type RecipeLine,
} from "@hovimestari/types";
import { AxiosError, type AxiosResponse } from "axios";
import { lineOf, recipeOf, type FixtureFood } from "./recipeFixtures";

// ---------------------------------------------------------------------------
// A fake recipe server behind the mocked `@/lib/api/recipes`, following
// apps/backend/src/services/writes/recipes.ts where the screen can tell:
//
// - A create with an id it holds answers that recipe again, unchanged.
// - An edit takes the whole recipe. A line sent under an id the recipe does
//   not hold takes the id of the first line the recipe holds that no sent id
//   claims and that equals it in every column (`keepingIds`), so the answer's
//   line ids can differ from the ones sent.
// - A line on a food it does not know, or a count of a portion it does not
//   know, is refused with its `line`, the line's index from 0.
// - Figures come from `recipeOf`, which runs `recipeBasis` and `entryFigures`.
// - A recipe used on a day (`used`) is hidden by a delete, else removed.
//
// A suite mocks `@/lib/api/recipes` itself and calls `serveRecipes`.
// ---------------------------------------------------------------------------

/** A refusal as the server sends it, naming a recipe line when `line` is given. */
export function refusedAt(status: number, code: string, line?: number): AxiosError {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { message: "Server text.", code, ...(line === undefined ? {} : { line }) },
  } as AxiosResponse);
}

/** A deep copy, so the screen never holds the server's own objects. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface FakePortion {
  foodId: string;
  grams: number;
  unit: FineliPortionUnit | null;
}

const sameLine = (a: IngredientLineBody, b: RecipeLine): boolean => {
  const written = JSON.stringify(a.written) === JSON.stringify(b.written) && a.note === b.note;
  if (!a.counted) return b.food === null && b.name === a.name && written;
  if (b.food?.id !== a.foodId) return false;
  const amount =
    "grams" in a.amount
      ? b.portion === null && b.grams === a.amount.grams
      : b.portion?.id === a.amount.portionId && b.portion.count === a.amount.count;
  return amount && written;
};

export class FakeRecipes {
  recipes = new Map<string, Recipe>();
  foods = new Map<string, FixtureFood>();
  portions = new Map<string, FakePortion>();
  /** Recipes an entry uses: a delete hides them. */
  used = new Set<string>();
  /**
   * The latest date a recipe is on, as the server reads it from the entries. A
   * suite that also runs the fake days server points this at its entries.
   */
  putOn: ((id: string) => string | null) | null = null;
  created: RecipeBody[] = [];
  updated: Array<{ id: string; body: RecipeEditBody }> = [];

  constructor(recipes: readonly Recipe[] = [], foods: readonly FixtureFood[] = []) {
    for (const food of foods) this.foods.set(food.id, food);
    for (const recipe of recipes) this.add(recipe);
  }

  /** Holds `recipe`, and the foods of its lines, so an edit of it finds them. */
  add(recipe: Recipe): Recipe {
    this.recipes.set(recipe.id, recipe);
    for (const line of recipe.lines) {
      if (line.food)
        this.foods.set(line.food.id, { id: line.food.id, name: line.food.name, per100g: line.food.per100g });
    }
    return recipe;
  }

  list(archived: boolean) {
    return {
      recipes: [...this.recipes.values()]
        .filter((r) => !r.deleted && r.archived === archived)
        .map((r) => recipeSummaryOf(this.dated(r))),
    };
  }

  get(id: string): Recipe {
    const recipe = this.recipes.get(id);
    if (!recipe) throw refusedAt(404, "recipe_not_found");
    return clone(this.dated(recipe));
  }

  private dated(recipe: Recipe): Recipe {
    return this.putOn ? { ...recipe, lastPutOn: this.putOn(recipe.id) } : recipe;
  }

  private build(id: string, body: RecipeEditBody, prev?: Recipe): Recipe {
    const lines = body.lines.map((line, i): RecipeLine => {
      if (!line.counted)
        return lineOf(
          { name: line.name, written: line.written ?? undefined, note: line.note ?? undefined },
          i,
          line.id,
        );
      const food = this.foods.get(line.foodId);
      if (!food) throw refusedAt(404, "food_not_found", i);
      if ("grams" in line.amount) {
        return lineOf(
          { food, grams: line.amount.grams, written: line.written ?? undefined, note: line.note ?? undefined },
          i,
          line.id,
        );
      }
      const portion = this.portions.get(line.amount.portionId);
      if (!portion || portion.foodId !== food.id) throw refusedAt(404, "portion_not_found", i);
      return lineOf(
        {
          food,
          grams: gramsForPortion(line.amount.count, portion.grams),
          portion: { id: line.amount.portionId, unit: portion.unit, name: null, count: line.amount.count },
          written: line.written ?? undefined,
          note: line.note ?? undefined,
        },
        i,
        line.id,
      );
    });
    return recipeOf(body.name, body.servings, lines, {
      id,
      timeMinutes: body.timeMinutes,
      tags: body.tags,
      steps: body.steps,
      notes: body.notes,
      favourite: prev?.favourite ?? false,
      archived: prev?.archived ?? false,
      lastPutOn: prev?.lastPutOn ?? null,
      lastServings: prev?.lastServings ?? null,
    });
  }

  create(body: RecipeBody): Recipe {
    this.created.push(clone(body));
    const held = this.recipes.get(body.id);
    if (held) return clone(held);
    const { id, ...rest } = body;
    const recipe = this.build(id, rest);
    this.recipes.set(id, recipe);
    return clone(recipe);
  }

  update(id: string, body: RecipeEditBody): Recipe {
    this.updated.push({ id, body: clone(body) });
    const prev = this.recipes.get(id);
    if (!prev || prev.deleted) throw refusedAt(404, "recipe_not_found");
    // keepingIds: a line under an id the recipe does not hold takes an identical held line's id.
    const held = new Set(prev.lines.map((l) => l.id));
    const claimed = new Set(body.lines.map((l) => l.id).filter((lineId) => held.has(lineId)));
    const lines = body.lines.map((line) => {
      if (held.has(line.id)) return line;
      const twin = prev.lines.find((l) => !claimed.has(l.id) && sameLine(line, l));
      if (!twin) return line;
      claimed.add(twin.id);
      return { ...line, id: twin.id };
    });
    const recipe = this.build(id, { ...body, lines }, prev);
    this.recipes.set(id, recipe);
    return clone(recipe);
  }

  setArchived(id: string, archived: boolean): void {
    const recipe = this.recipes.get(id);
    if (!recipe || recipe.deleted) throw refusedAt(404, "recipe_not_found");
    this.recipes.set(id, { ...recipe, archived });
  }

  setFavourite(id: string, favourite: boolean): void {
    const recipe = this.recipes.get(id);
    if (!recipe || recipe.deleted) throw refusedAt(404, "recipe_not_found");
    this.recipes.set(id, { ...recipe, favourite });
  }

  remove(id: string): void {
    const recipe = this.recipes.get(id);
    if (!recipe || recipe.deleted) throw refusedAt(404, "recipe_not_found");
    if (this.used.has(id)) this.recipes.set(id, { ...recipe, deleted: true, favourite: false });
    else this.recipes.delete(id);
  }
}

/** Answers every mocked recipe route from `server`. */
export function serveRecipes(server: FakeRecipes): FakeRecipes {
  jest.mocked(getRecipes).mockImplementation(async (archived) => server.list(archived));
  jest.mocked(getRecipe).mockImplementation(async (id) => server.get(id));
  jest.mocked(createRecipe).mockImplementation(async (body) => server.create(body));
  jest.mocked(updateRecipe).mockImplementation(async (id, body) => server.update(id, body));
  jest.mocked(setRecipeArchived).mockImplementation(async (id, archived) => server.setArchived(id, archived));
  jest.mocked(setRecipeFavourite).mockImplementation(async (id, favourite) => server.setFavourite(id, favourite));
  jest.mocked(deleteRecipe).mockImplementation(async (id) => server.remove(id));
  return server;
}
