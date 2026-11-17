import type { SavedMeal } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The log sheet finds saved meals on the device: the list is the user's own
// and small, read whole once. A meal matches when every typed word is part of
// its name or its source, with case and accents folded, so "kana" finds
// "Kanasalaatti" and "wolt" finds a meal from Wolt. A chosen source keeps the
// meals from it alone. The chips show only while the meals name two sources
// or more, so a chosen source counts only then (`activeSource`): no filter is
// ever in force that the user cannot see and clear.
// ---------------------------------------------------------------------------

/** Lower case with accents taken off: "Pähkinä" reads "pahkina". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fi");
}

/** The meals whose name or source holds every word of `query`, from `source` alone when one is chosen. */
export function mealFilter(meals: readonly SavedMeal[], query: string, source: string | null = null): SavedMeal[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return meals.filter((meal) => {
    if (source !== null && meal.source !== source) return false;
    const text = fold(`${meal.name} ${meal.source ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

/** The sources the meals name, each once, in the Finnish order the server sorts names in. */
export function sourcesOf(meals: readonly SavedMeal[]): string[] {
  const all = new Set(meals.map((m) => m.source).filter((s): s is string => s !== null));
  return [...all].sort((a, b) => a.localeCompare(b, "fi"));
}

/** The chosen source while its chips show and a meal still names it, else null: every meal. */
export function activeSource(meals: readonly SavedMeal[], source: string | null): string | null {
  if (source === null) return null;
  const sources = sourcesOf(meals);
  return sources.length >= 2 && sources.includes(source) ? source : null;
}
