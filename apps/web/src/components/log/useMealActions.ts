"use client";

import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { setSavedMealArchived } from "@/lib/api/savedMeals";
import { getErrorCode } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
import { afterSavedMealArchived } from "@/lib/invalidation";
import type { SavedMeal } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useMealActions: archiving and restoring a saved meal from the log sheet,
// one press each, from the meal view or the archived list. Each is its own
// undo: Archive meal turns into Restore meal in place, and back.
//
// - One at a time: while one runs, every archive and restore ignores a press.
//   Writes wait while the app asks the server for today (`held`).
// - The answer moves the meal out of the list it was in, in place, and the
//   lists are read again (`afterSavedMealArchived`).
// - A failure says so on the sheet's status line: "You are offline." when
//   nothing was sent, "Could not confirm. Try again." when it may have landed
//   (a second press sends the same, harmless request), else the code's copy.
//   A meal that is gone goes to `onGone`.
// ---------------------------------------------------------------------------

export interface MealActions {
  /** The id of the meal whose archive or restore runs, or null. */
  busyId: string | null;
  /** Archives or restores `meal`. Answers the meal as it now is, or null when nothing changed. */
  setArchived: (meal: SavedMeal, archived: boolean) => Promise<SavedMeal | null>;
}

export interface UseMealActionsOptions {
  held: boolean;
  /** Puts a failure on the sheet's status line. */
  sayFailure: (text: string) => void;
  onGone: (id: string) => void;
}

export function useMealActions({ held, sayFailure, onGone }: UseMealActionsOptions): MealActions {
  const failureLine = useFailureLine("status");
  const client = useQueryClient();
  const offline = useKnownOffline();
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const setArchived = useCallback(
    async (meal: SavedMeal, archived: boolean): Promise<SavedMeal | null> => {
      if (busyRef.current || held) return null;
      if (offline) {
        sayFailure(failureLine(new OfflineError()));
        return null;
      }
      busyRef.current = true;
      setBusyId(meal.id);
      try {
        await setSavedMealArchived(meal.id, archived);
        void afterSavedMealArchived(client, meal.id, archived);
        return { ...meal, archived };
      } catch (err) {
        if (getErrorCode(err) === "saved_meal_not_found") onGone(meal.id);
        else sayFailure(failureLine(err));
        return null;
      } finally {
        busyRef.current = false;
        setBusyId(null);
      }
    },
    [client, failureLine, held, offline, onGone, sayFailure],
  );

  return { busyId, setArchived };
}
