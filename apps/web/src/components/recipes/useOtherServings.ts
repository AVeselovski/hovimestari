import { addDays, isIsoDate } from "@/lib/localDate";
import { dayQuery } from "@/lib/queryOptions";
import type { Entry } from "@hovimestari/types";
import { useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";

/** How many days the other planned servings are looked for on: the day the batch was made and the six after. */
export const OTHER_SERVINGS_DAYS = 7;

export interface OtherServings {
  /** The servings to list: the window's own once it has settled, until then the last list that had. */
  entries: Entry[];
  /** Every day of the window has answered or failed, so `entries` is this window's. */
  settled: boolean;
}

/**
 * The person's other planned servings of a recipe that a batch made on
 * `from` may have fed: the plain planned entries of the recipe from that day
 * to six days after, by date and place, without the entry the sheet opened
 * from. Read from the days themselves, each from the cache when it holds
 * the day. A day that cannot be read adds nothing.
 *
 * The list shows once, whole, when every day has answered or failed, and
 * never grows row by row. While a new window is read, after the batch's day
 * changed, the list is the last one that settled and `settled` is false: a
 * tick in it stays on screen, and the sheet waits rather than send a batch
 * without it.
 *
 * A serving this batch already holds stays in the list, though it is no
 * longer a plain entry: a request whose answer never came may have landed,
 * and the same press sent again names the same servings.
 */
export function useOtherServings(
  recipeId: string,
  from: string,
  exceptId: string | null,
  cookId: string,
): OtherServings {
  const dates = useMemo(
    () => (isIsoDate(from) ? Array.from({ length: OTHER_SERVINGS_DAYS }, (_, i) => addDays(from, i)) : []),
    [from],
  );
  const days = useQueries({ queries: dates.map((date) => dayQuery(date)) });
  const settled = days.every((d) => d.data !== undefined || d.isError);
  const entries = settled
    ? days
        .flatMap((d) => d.data?.entries ?? [])
        .filter(
          (e) =>
            e.kind === "recipe" &&
            e.recipe?.id === recipeId &&
            (e.cook === null || e.cook.id === cookId) &&
            e.status === "planned" &&
            e.id !== exceptId,
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
    : null;
  // The last settled list, kept in state and replaced only when its content changes.
  const key = entries === null ? null : JSON.stringify(entries);
  const [last, setLast] = useState<{ key: string; entries: Entry[] }>({ key: "[]", entries: [] });
  if (entries !== null && key !== null && key !== last.key) setLast({ key, entries });
  return { entries: entries === null || key === last.key ? last.entries : entries, settled };
}
