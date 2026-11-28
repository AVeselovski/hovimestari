import { sortRecipes, tagKey, type RecipeSummary } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// A person's tags, compared one way everywhere on screen, the way the server
// keeps a recipe's tags once: by lower case (`tagKey`). "Dinner" and
// "dinner" are one tag: one chip in the Library, one chip under the
// editor's tag field, and one tag on a recipe. An accent makes another
// letter, so "Häät" and "Haat" are two tags, each with its chip.
// ---------------------------------------------------------------------------

/** Whether two tags are the same tag. */
export const sameTag = (a: string, b: string): boolean => tagKey(a) === tagKey(b);

/**
 * Each tag `recipes` use, once, in the spelling of the first recipe by name
 * that has it, in Finnish order.
 */
export function tagsInUse(recipes: readonly RecipeSummary[]): string[] {
  const spelled = new Map<string, string>();
  for (const recipe of sortRecipes(recipes, "name")) {
    for (const tag of recipe.tags) if (!spelled.has(tagKey(tag))) spelled.set(tagKey(tag), tag);
  }
  return [...spelled.values()].sort((a, b) => a.localeCompare(b, "fi"));
}
