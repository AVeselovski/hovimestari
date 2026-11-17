import type { RecentItem, RecentList, SavedMeal, SavedMealList } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { insertSorted } from "./foodCache";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// A saved meal write's own answer, put into the cached reads in place, before
// they are read again (lib/invalidation.ts). A row keeps its place in every
// list, so a list under the thumb never re-orders while it is on screen.
// ---------------------------------------------------------------------------

const LISTS = [queryKeys.savedMealList(false), queryKeys.savedMealList(true)] as const;

function editLists(client: QueryClient, edit: (meals: SavedMeal[]) => SavedMeal[]): void {
  for (const key of LISTS) {
    client.setQueryData<SavedMealList>(key, (list) => (list ? { meals: edit(list.meals) } : list));
  }
}

function editRecents(client: QueryClient, edit: (meal: SavedMeal) => SavedMeal | null): void {
  client.setQueryData<RecentList>(queryKeys.recents(), (list) => {
    if (!list) return list;
    const items = list.items.flatMap((item): RecentItem[] => {
      if (item.kind !== "saved_meal") return [item];
      const meal = edit(item.meal);
      return meal === null ? [] : [{ ...item, meal }];
    });
    return { items };
  });
}

/** An edited meal replaces its row, in place, in both lists and in the recent items. */
export function putMeal(client: QueryClient, meal: SavedMeal): void {
  editLists(client, (meals) => meals.map((m) => (m.id === meal.id ? meal : m)));
  editRecents(client, (m) => (m.id === meal.id ? meal : m));
}

/**
 * A new meal in the cached active meals, at the place the server's order by
 * name gives it, so the list shows it as the sheet that saved it closes.
 */
export function putNewMeal(client: QueryClient, meal: SavedMeal): void {
  client.setQueryData<SavedMealList>(queryKeys.savedMealList(false), (list) =>
    !list || list.meals.some((m) => m.id === meal.id) ? list : { meals: insertSorted(list.meals, meal) },
  );
}

/** An archived or restored meal leaves the list it was in, in place. */
export function takeMealOutOf(client: QueryClient, id: string, archived: boolean): void {
  client.setQueryData<SavedMealList>(queryKeys.savedMealList(archived), (list) =>
    list ? { meals: list.meals.filter((m) => m.id !== id) } : list,
  );
}

/** A deleted meal, or one found gone, leaves both lists and the recent items. */
export function dropMeal(client: QueryClient, id: string): void {
  editLists(client, (meals) => meals.filter((m) => m.id !== id));
  editRecents(client, (m) => (m.id === id ? null : m));
}
