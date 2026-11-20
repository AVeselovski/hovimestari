"use client";

import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useToday } from "@/hooks/useToday";
import { setRecipeArchived, setRecipeFavourite } from "@/lib/api/recipes";
import { OfflineError } from "@/lib/failure";
import { afterRecipeArchived, afterRecipeFavourite } from "@/lib/invalidation";
import { putRecipeFavourite } from "@/lib/recipeCache";
import type { RecipeSummary } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// useRecipeActions: a recipe's favourite mark and its archive, one at a
// time, from its page and its editor.
//
// - The star turns at once, in the recipe's row and on its page, and turns
//   back with the failure's line when the write fails.
// - Archive and Restore wait for the answer, then move the recipe between
//   the active and archived lists. Each answers null, or the failure's line
//   for the caller to show where the press was.
// - Writes wait while the app asks the server for today, and a press while
//   known offline sends nothing and says so.
// ---------------------------------------------------------------------------

export interface RecipeActions {
  /** The id of the recipe whose archive or restore runs, or null. */
  busyId: string | null;
  /** Marks or clears the favourite. Answers null, or the failure's line. */
  setFavourite: (recipe: RecipeSummary, favourite: boolean) => Promise<string | null>;
  /** Archives or restores. Answers null, or the failure's line. */
  setArchived: (recipe: RecipeSummary, archived: boolean) => Promise<string | null>;
}

export function useRecipeActions(): RecipeActions {
  const client = useQueryClient();
  const failureLine = useFailureLine("form");
  const offline = useKnownOffline();
  const { holding } = useToday();
  const [busyId, setBusyId] = useState<string | null>(null);

  const setFavourite = useCallback(
    async (recipe: RecipeSummary, favourite: boolean): Promise<string | null> => {
      if (holding) return null;
      if (offline) return failureLine(new OfflineError());
      putRecipeFavourite(client, recipe.id, favourite);
      try {
        await setRecipeFavourite(recipe.id, favourite);
      } catch (err) {
        putRecipeFavourite(client, recipe.id, !favourite);
        return failureLine(err);
      }
      void afterRecipeFavourite(client, recipe.id);
      return null;
    },
    [client, failureLine, holding, offline],
  );

  const setArchived = useCallback(
    async (recipe: RecipeSummary, archived: boolean): Promise<string | null> => {
      if (holding || busyId !== null) return null;
      if (offline) return failureLine(new OfflineError());
      setBusyId(recipe.id);
      try {
        await setRecipeArchived(recipe.id, archived);
      } catch (err) {
        return failureLine(err);
      } finally {
        setBusyId(null);
      }
      await afterRecipeArchived(client, recipe.id, archived);
      return null;
    },
    [busyId, client, failureLine, holding, offline],
  );

  return { busyId, setFavourite, setArchived };
}
