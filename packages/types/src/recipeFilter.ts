import { scaled } from "./figures.js";
import type { RecipeFilter, RecipeSort, RecipeSummary } from "./recipes.js";

// Finding a recipe: the one filter and the one sort, run by the web on the
// device on every key and by the server for an assistant's list_recipes, so
// both find the same recipes in the same order. One person's recipes are a
// few hundred at most, read whole once.

/** Lower case with accents taken off: "Pähkinä" reads "pahkina". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fi");
}

/**
 * Whether `value`, as shown to one decimal, is at least `min` and at most
 * `max`. The figure is rounded, never the bound: "at least 22.34" leaves out
 * a figure shown as 22.3. Whole tenths over ten give the double a typed
 * number parses to, so 0.3 shown is 0.3 typed.
 */
function within(value: number, min: number | undefined, max: number | undefined): boolean {
  const shown = scaled(value, 1) / 10;
  if (min !== undefined && shown < min) return false;
  if (max !== undefined && shown > max) return false;
  return true;
}

/**
 * The recipes `filter` keeps: archived or active, every word of `q` part of
 * the name or a tag, every tag of `tags` among the recipe's, favourites
 * alone when asked, and the figures per serving within the bounds as they
 * are shown, so "at least 30 g" keeps a recipe that shows 30.0 g. Case and
 * accents are folded. The order is kept.
 */
export function filterRecipes<R extends RecipeSummary>(
  recipes: readonly R[],
  filter: Omit<RecipeFilter, "sort"> & { sort?: RecipeSort },
): R[] {
  const words = fold(filter.q ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const wanted = (filter.tags ?? []).map(fold);
  return recipes.filter((recipe) => {
    if (recipe.archived !== filter.archived) return false;
    if (filter.favourites === true && !recipe.favourite) return false;
    const tags = recipe.tags.map(fold);
    if (!wanted.every((tag) => tags.includes(tag))) return false;
    const text = fold(`${recipe.name} ${recipe.tags.join(" ")}`);
    if (!words.every((word) => text.includes(word))) return false;
    return (
      within(recipe.perServing.proteinG, filter.minProteinG, filter.maxProteinG) &&
      within(recipe.perServing.energyKcal, filter.minEnergyKcal, filter.maxEnergyKcal)
    );
  });
}

const byName = (a: RecipeSummary, b: RecipeSummary): number =>
  a.name.localeCompare(b.name, "fi") || a.id.localeCompare(b.id);

const ORDERS: Record<RecipeSort, (a: RecipeSummary, b: RecipeSummary) => number> = {
  name: () => 0,
  // Latest first, never put on a day last.
  lastPutOn: (a, b) =>
    a.lastPutOn === b.lastPutOn
      ? 0
      : a.lastPutOn === null
        ? 1
        : b.lastPutOn === null
          ? -1
          : a.lastPutOn < b.lastPutOn
            ? 1
            : -1,
  // Most protein per serving first.
  protein: (a, b) => scaled(b.perServing.proteinG, 1) - scaled(a.perServing.proteinG, 1),
  // Fewest kcal per serving first.
  energy: (a, b) => scaled(a.perServing.energyKcal, 1) - scaled(b.perServing.energyKcal, 1),
};

/**
 * The recipes in `sort` order, ties by name in Finnish order (å, ä and ö
 * after z), then by id. A new array.
 */
export function sortRecipes<R extends RecipeSummary>(recipes: readonly R[], sort: RecipeSort): R[] {
  const order = ORDERS[sort];
  return [...recipes].sort((a, b) => order(a, b) || byName(a, b));
}
