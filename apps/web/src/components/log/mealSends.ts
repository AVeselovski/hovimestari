import { getErrorCode } from "@/lib/errors";
import type { EntryStatus, SavedMeal, SavedMealEditBody, TypedFigures } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// A new saved meal's sends whose answers never came. The sheet keeps its ids
// across retries, so a retry cannot make a second meal or a second entry.
// But the server answers a repeated id with what it saved the first time and
// ignores the body. So when the user changes the form after a send that could
// not confirm and presses again, the latest press decides, and what the
// earlier send may have written is brought to it first:
//
// - The meal's name, source or figures changed: `PUT /saved-meals/:id` with
//   the form as it is now. A 404 means the earlier send never landed, and
//   neither did its entry (they are one transaction), so nothing else is
//   needed. A 200 means the meal now holds what is on screen.
// - The earlier send was a "Save and log", and the press now asks for
//   something else (other figures, the other state, or "Save meal" alone):
//   that entry is removed (`DELETE /entries/:id`). When the DELETE removed
//   one, the entry gets a new id: an entry keeps the figures it was added
//   with, so replaying its id would log the old figures. When it answers 404,
//   nothing is there yet and the entry keeps its id, so an earlier send that
//   is still on its way and lands after this press replays it instead of
//   adding a second entry. A new name or source alone keeps the entry: an
//   entry shows its meal's name as it is now.
//
// Then the press is sent as usual. A replay of the meal answers it as it now
// is, and a new entry takes its figures.
// ---------------------------------------------------------------------------

/** The entry a "Save and log" adds, and the meal's figures it would be added with. */
export interface MealSendEntry {
  id: string;
  date: string;
  status: EntryStatus;
  count: number;
  figures: TypedFigures;
}

/** One press of the sheet: the meal, and the entry for "Save and log" or null for "Save meal". */
export interface MealSend {
  meal: SavedMealEditBody;
  entry: MealSendEntry | null;
}

export interface MealSendWrites {
  /** `PUT /saved-meals/:id` with this body. */
  putMeal: (body: SavedMealEditBody) => Promise<SavedMeal>;
  /** `DELETE /entries/:id`: true when it removed the entry, false on a 404. */
  dropEntry: (entry: MealSendEntry) => Promise<boolean>;
}

function sameMeal(a: SavedMealEditBody, b: SavedMealEditBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameEntry(a: MealSendEntry | null, b: MealSendEntry | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.date === b.date &&
    a.status === b.status &&
    a.count === b.count &&
    JSON.stringify(a.figures) === JSON.stringify(b.figures)
  );
}

/**
 * Brings what an unconfirmed send may have written (`held.current`) to what
 * `next` asks for. `held.current` follows what is learned at each step, so a
 * step that fails leaves it true for the next press. Answers true when the
 * entry needs a new id: only when the DELETE removed one. Throws the first failure.
 */
export async function bringUpToDate(
  held: { current: MealSend | null },
  next: MealSend,
  writes: MealSendWrites,
): Promise<boolean> {
  const sent = held.current;
  if (sent === null) return false;
  if (!sameMeal(sent.meal, next.meal)) {
    try {
      await writes.putMeal(next.meal);
    } catch (err) {
      if (getErrorCode(err) !== "saved_meal_not_found") throw err;
      // The earlier send never landed: nothing under these ids.
      held.current = null;
      return false;
    }
    held.current = { ...sent, meal: next.meal };
  }
  const entry = held.current?.entry ?? null;
  if (entry === null || sameEntry(entry, next.entry)) return false;
  // Nothing there yet: the press goes under the same id, and a late earlier send replays it.
  // `held.current` keeps the entry, so a press refused after this one removes it again.
  if (!(await writes.dropEntry(entry))) return false;
  held.current = { meal: next.meal, entry: null };
  return true;
}
