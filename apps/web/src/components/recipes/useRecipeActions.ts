"use client";

import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useToday } from "@/hooks/useToday";
import { setRecipeArchived, setRecipeFavourite } from "@/lib/api/recipes";
import { OfflineError } from "@/lib/failure";
import { afterRecipeArchived, afterRecipeFavourite } from "@/lib/invalidation";
import { queryKeys } from "@/lib/queryKeys";
import { putRecipeFavourite } from "@/lib/recipeCache";
import type { RecipeSummary } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useRecipeActions: a recipe's favourite mark and its archive, one at a
// time, from its page and its editor.
//
// - The star turns at once, in the recipe's row and on its page, and turns
//   back with the failure's line when the write fails.
// - Archive and Restore wait for the answer, then move the recipe between
//   the active and archived lists, in place, and the lists are read again
//   without the press waiting for them.
// - Each press answers how it went (`RecipeOutcome`): done, or not done with
//   the line a failure shows where the press was. A press that sent nothing,
//   while one archive runs or while writes wait, is not done and has no
//   line, so a caller never says "Archived" for it.
// - Writes wait while the app asks the server for today (`held`, which the
//   page puts on its buttons), and a press while known offline sends nothing
//   and says so.
// ---------------------------------------------------------------------------

/** How a press went: done, or the line to show, null when nothing was sent and there is nothing to say. */
export type RecipeOutcome = { ok: true } | { ok: false; failure: string | null };

const DONE: RecipeOutcome = { ok: true };
const NOT_SENT: RecipeOutcome = { ok: false, failure: null };

export interface RecipeActions {
  /** The id of the recipe whose archive or restore runs, or null. */
  busyId: string | null;
  /** Writes wait: the app is asking the server for today. */
  held: boolean;
  /** Marks or clears the favourite. */
  setFavourite: (recipe: RecipeSummary, favourite: boolean) => Promise<RecipeOutcome>;
  /** Archives or restores. */
  setArchived: (recipe: RecipeSummary, archived: boolean) => Promise<RecipeOutcome>;
}

export function useRecipeActions(): RecipeActions {
  const client = useQueryClient();
  const failureLine = useFailureLine("form");
  const offline = useKnownOffline();
  const { holding } = useToday();
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = useRef(false);

  const setFavourite = useCallback(
    async (recipe: RecipeSummary, favourite: boolean): Promise<RecipeOutcome> => {
      if (holding) return NOT_SENT;
      if (offline) return { ok: false, failure: failureLine(new OfflineError()) };
      // A read already out would answer the old mark over the new one.
      await client.cancelQueries({ queryKey: queryKeys.recipes() });
      putRecipeFavourite(client, recipe.id, favourite);
      try {
        await setRecipeFavourite(recipe.id, favourite);
      } catch (err) {
        putRecipeFavourite(client, recipe.id, !favourite);
        // What the server holds now is not known, after two presses least of all: it is read again.
        void afterRecipeFavourite(client, recipe.id);
        return { ok: false, failure: failureLine(err) };
      }
      void afterRecipeFavourite(client, recipe.id);
      return DONE;
    },
    [client, failureLine, holding, offline],
  );

  const setArchived = useCallback(
    async (recipe: RecipeSummary, archived: boolean): Promise<RecipeOutcome> => {
      if (holding || busy.current) return NOT_SENT;
      if (offline) return { ok: false, failure: failureLine(new OfflineError()) };
      busy.current = true;
      setBusyId(recipe.id);
      try {
        await setRecipeArchived(recipe.id, archived);
        // The lists and the page hold the answer once this resolves. The reads that follow are not waited for.
        await afterRecipeArchived(client, recipe.id, archived);
        return DONE;
      } catch (err) {
        return { ok: false, failure: failureLine(err) };
      } finally {
        busy.current = false;
        setBusyId(null);
      }
    },
    [client, failureLine, holding, offline],
  );

  return { busyId, held: holding, setFavourite, setArchived };
}
