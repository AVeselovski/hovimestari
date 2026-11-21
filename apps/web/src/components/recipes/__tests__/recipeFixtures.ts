import { uuid } from "@/components/foods/__tests__/support";
import {
  entryFigures,
  recipeBasis,
  type Figures,
  type FineliPortionUnit,
  type IngredientUnit,
  type Recipe,
  type RecipeLine,
} from "@hovimestari/types";

// Recipes as the API answers them, their figures computed by `recipeBasis`
// and `entryFigures` from their lines, never typed by hand, so a fixture's
// figures are what the server would answer for the same lines.

/** A food on a line, with its values per 100 g. */
export interface FixtureFood {
  id: string;
  name: string;
  per100g: Figures;
}

export const food = (name: string, per100g: Figures): FixtureFood => ({ id: uuid(), name, per100g });

/** The worked example's foods (invented values per 100 g). */
export const EGG = food("Kananmuna", { energyKcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 });
export const TOMATO = food("Tomaattimurska", { energyKcal: 24, proteinG: 1.2, carbsG: 3.9, fatG: 0.2 });
export const FETA = food("Feta", { energyKcal: 264, proteinG: 14.2, carbsG: 4.1, fatG: 21.3 });
export const OIL = food("Oliiviöljy", { energyKcal: 884, proteinG: 0, carbsG: 0, fatG: 100 });

export type FixtureLine =
  | {
      food: FixtureFood;
      grams: number;
      portion?: { id: string; unit: FineliPortionUnit | null; name: string | null; count: number };
      written?: { amount: number; unit: IngredientUnit };
      note?: string;
    }
  | { name: string; written?: { amount: number; unit: IngredientUnit }; note?: string };

export function lineOf(line: FixtureLine, position: number, id: string = uuid()): RecipeLine {
  if ("food" in line) {
    return {
      id,
      position,
      counted: true,
      food: { ...line.food, source: "fineli", retired: false, deleted: false },
      name: null,
      grams: line.grams,
      portion: line.portion ?? null,
      written: line.written ?? null,
      note: line.note ?? null,
    };
  }
  return {
    id,
    position,
    counted: false,
    food: null,
    name: line.name,
    grams: null,
    portion: null,
    written: line.written ?? null,
    note: line.note ?? null,
  };
}

/** A recipe as `GET /recipes/:id` answers it, its figures from its lines. */
export function recipeOf(
  name: string,
  servings: number,
  lines: readonly (FixtureLine | RecipeLine)[],
  overrides: Partial<Recipe> = {},
): Recipe {
  const built = lines.map((l, i) => ("position" in l ? l : lineOf(l, i)));
  const basis = recipeBasis(
    built.flatMap((l) => (l.food && l.grams !== null ? [{ per100g: l.food.per100g, grams: l.grams }] : [])),
    servings,
  );
  return {
    id: uuid(),
    name,
    servings,
    timeMinutes: null,
    tags: [],
    favourite: false,
    archived: false,
    perServing: entryFigures(basis, { per: "serving", count: 1 }),
    basis,
    lastPutOn: null,
    lastServings: null,
    imageId: null,
    foodsGone: false,
    deleted: false,
    whole: entryFigures(basis, { per: "serving", count: servings }),
    lines: built,
    steps: [],
    notes: null,
    ...overrides,
  };
}

/** The design's worked example: serves 2, 365 kcal and 21.8 g protein per serving. */
export function shakshuka(overrides: Partial<Recipe> = {}): Recipe {
  return recipeOf(
    "Shakshuka",
    2,
    [
      { food: EGG, grams: 240 },
      { food: TOMATO, grams: 400 },
      { food: FETA, grams: 60 },
      { food: OIL, grams: 15 },
      { name: "Salt" },
    ],
    overrides,
  );
}
