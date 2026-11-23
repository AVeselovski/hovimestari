import type { Recipe } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { isFreshRead } from "./queryClient";
import { recipeQuery } from "./queryOptions";

// A recipe as the server holds it, for a form that starts from it: the
// editor, which sends the whole recipe back, and the "log as made" sheet,
// which starts a batch from its lines. A form opened on an older copy would
// write over, or differ from, a change made elsewhere, such as by a
// connected assistant.

/**
 * The cached recipe when a form can open on it at once: a read that is
 * fresh (within the stale time and not invalidated since), or offline what
 * was last read. Undefined when it has to be read first.
 */
export function heldRecipeForForm(client: QueryClient, id: string, offline: boolean): Recipe | undefined {
  const state = client.getQueryState<Recipe>(recipeQuery(id).queryKey);
  return state?.data !== undefined && (isFreshRead(state) || offline) ? state.data : undefined;
}

/**
 * Reads the recipe for a form that could not open on the cached one. Null
 * when the device is offline, which sends nothing. A failed read throws.
 */
export async function readRecipeForForm(client: QueryClient, id: string, offline: boolean): Promise<Recipe | null> {
  if (offline) return null;
  return client.fetchQuery({ ...recipeQuery(id), staleTime: 0 });
}
