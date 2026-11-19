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
// - Each press answers how it went (`ArchiveOutcome`): the meal as it now
//   is, or the line a failure shows. "You are offline." when nothing was
//   sent, "Could not confirm. Try again." when it may have landed (a second
//   press sends the same, harmless request), else the code's copy. The
//   caller puts that line where the press was made, such as the log sheet's
//   status line or the edit sheet's error line. A meal that is gone goes to
//   `onGone`, and a press refused while one runs or while writes wait shows
//   nothing.
// ---------------------------------------------------------------------------

/** How an archive or restore went: the meal as it now is, or the line to show, null when there is none. */
export type ArchiveOutcome = { ok: true; meal: SavedMeal } | { ok: false; failure: string | null };

export interface MealActions {
  /** The id of the meal whose archive or restore runs, or null. */
  busyId: string | null;
  /** Archives or restores `meal`, and answers how it went. */
  setArchived: (meal: SavedMeal, archived: boolean) => Promise<ArchiveOutcome>;
}

export interface UseMealActionsOptions {
  held: boolean;
  onGone: (id: string) => void;
}

/** Shows an outcome's failure line through `say`, and answers the meal when it went through. */
export function sayIfFailed(outcome: ArchiveOutcome, say: (text: string) => void): SavedMeal | null {
  if (outcome.ok) return outcome.meal;
  if (outcome.failure !== null) say(outcome.failure);
  return null;
}

export function useMealActions({ held, onGone }: UseMealActionsOptions): MealActions {
  const failureLine = useFailureLine("status");
  const client = useQueryClient();
  const offline = useKnownOffline();
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const setArchived = useCallback(
    async (meal: SavedMeal, archived: boolean): Promise<ArchiveOutcome> => {
      if (busyRef.current || held) return { ok: false, failure: null };
      if (offline) return { ok: false, failure: failureLine(new OfflineError()) };
      busyRef.current = true;
      setBusyId(meal.id);
      try {
        await setSavedMealArchived(meal.id, archived);
        void afterSavedMealArchived(client, meal.id, archived);
        return { ok: true, meal: { ...meal, archived } };
      } catch (err) {
        if (getErrorCode(err) !== "saved_meal_not_found") return { ok: false, failure: failureLine(err) };
        onGone(meal.id);
        return { ok: false, failure: null };
      } finally {
        busyRef.current = false;
        setBusyId(null);
      }
    },
    [client, failureLine, held, offline, onGone],
  );

  return { busyId, setArchived };
}
