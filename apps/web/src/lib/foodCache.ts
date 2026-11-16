import type { FavouriteFoodList, FoodDetail, FoodList, FoodSummary, Portion } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { foodSearchKey, queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// Edits to the cached food reads, from a write's own answer. A list that is
// not on screen is only marked stale by an invalidation, and when it comes
// back it shows its cached answer until the read lands. So a write puts what
// it knows into every cached read first, and the list that comes back shows
// the new state at once. Each edit is exact: it changes a row the write
// answered, and leaves every order to the server.
// ---------------------------------------------------------------------------

/** A food as a list shows it, from its detail. */
export function summaryOf(food: FoodDetail): FoodSummary {
  const { id, source, name, otherName, per100g, isFavourite, isOwn, retired } = food;
  return { id, source, name, otherName, per100g, isFavourite, isOwn, retired };
}

function mapRows<L extends { foods: FoodSummary[] }>(
  list: L | undefined,
  edit: (row: L["foods"][number]) => L["foods"][number] | null,
): L | undefined {
  if (!list) return list;
  const foods: L["foods"] = [];
  let changed = false;
  for (const row of list.foods) {
    const next = edit(row);
    if (next !== row) changed = true;
    if (next !== null) foods.push(next);
  }
  return changed ? { ...list, foods } : list;
}

/** Edits the row of food `id` in every cached search, the own foods and the favourites. `null` drops it. */
export function editRows(client: QueryClient, id: string, edit: <R extends FoodSummary>(row: R) => R | null): void {
  const at = <R extends FoodSummary>(row: R): R | null => (row.id === id ? edit(row) : row);
  client.setQueriesData<FoodList>({ queryKey: queryKeys.foodSearches() }, (l) => mapRows(l, at));
  client.setQueryData<FoodList>(queryKeys.foodOwn(), (l) => mapRows(l, at));
  client.setQueryData<FavouriteFoodList>(queryKeys.foodFavourites(), (l) => mapRows(l, at));
}

/** The user's own food as saved: its detail, and its row wherever a list holds it. */
export function putSavedFood(client: QueryClient, food: FoodDetail): void {
  client.setQueryData(queryKeys.foodDetail(food.id), food);
  const summary = summaryOf(food);
  editRows(client, food.id, (row) => ({ ...row, ...summary }));
}

/**
 * A new own food in the searches that can only answer it: a search that
 * found nothing, for exactly the food's name. Every word of it is in the
 * name, and nothing else changed, so the server would answer this one food.
 * Returns the keys it wrote.
 */
export function putNewFoodInSearches(client: QueryClient, food: FoodDetail): Set<string> {
  const written = new Set<string>();
  const key = queryKeys.foodSearch(foodSearchKey(food.name));
  const held = client.getQueryData<FoodList>(key);
  if (held && held.foods.length === 0) {
    client.setQueryData<FoodList>(key, { foods: [summaryOf(food)] });
    written.add(JSON.stringify(key));
  }
  return written;
}

/**
 * Finnish alphabetical order, as the server sorts the own foods and the
 * user's own portions: the name under `fi-x-icu`, where two names it holds
 * equal fall back to their code points, then the id. ICU's Finnish rules are
 * the browser's `Intl.Collator("fi")` too, so a row goes where the server
 * puts it. The read that follows settles any difference between two ICU
 * releases.
 */
const finnish = new Intl.Collator("fi");
function byName(a: { name: string | null; id: string }, b: { name: string | null; id: string }): number {
  const x = a.name ?? "";
  const y = b.name ?? "";
  return finnish.compare(x, y) || (x < y ? -1 : x > y ? 1 : 0) || (a.id < b.id ? -1 : 1);
}

/** `rows` with `row` put in, before the first row from `from` on that sorts after it. */
function insertSorted<R extends { name: string | null; id: string }>(rows: R[], row: R, from = 0): R[] {
  const after = rows.findIndex((r, i) => i >= from && byName(row, r) < 0);
  const next = [...rows];
  next.splice(after === -1 ? rows.length : after, 0, row);
  return next;
}

/** A new own food in the cached own foods, at the place the server's order gives it. */
export function putNewOwnFood(client: QueryClient, food: FoodDetail): void {
  client.setQueryData<FoodList>(queryKeys.foodOwn(), (l) =>
    !l || l.foods.some((f) => f.id === food.id) ? l : { ...l, foods: insertSorted(l.foods, summaryOf(food)) },
  );
}

/**
 * A portion as saved, in the food's cached detail, at the place the server's
 * order gives it: Fineli's measures first, then the user's own by name. An
 * edit takes the old one out first, since a new name may move it.
 */
export function putPortion(client: QueryClient, foodId: string, portion: Portion): void {
  client.setQueryData<FoodDetail>(queryKeys.foodDetail(foodId), (d) => {
    if (!d) return d;
    const rest = d.portions.filter((p) => p.id !== portion.id);
    const firstOwn = rest.findIndex((p) => p.unit === null);
    return { ...d, portions: insertSorted(rest, portion, firstOwn === -1 ? rest.length : firstOwn) };
  });
}

/** A deleted portion leaves the food's cached detail. */
export function dropPortion(client: QueryClient, foodId: string, portionId: string): void {
  client.setQueryData<FoodDetail>(queryKeys.foodDetail(foodId), (d) =>
    d && d.portions.some((p) => p.id === portionId)
      ? { ...d, portions: d.portions.filter((p) => p.id !== portionId) }
      : d,
  );
}

/** A food that is gone: its detail is dropped, and its row leaves every list. */
export function dropFood(client: QueryClient, id: string): void {
  client.removeQueries({ queryKey: queryKeys.foodDetail(id), exact: true });
  editRows(client, id, () => null);
}

/**
 * A favourite mark, in place. The star flips in the detail and in every row
 * that shows the food, and no list is put in a new order, so the list under
 * the thumb never moves. The favourites list gains the food at its top,
 * newest first, or loses it. `previous` puts back a row at the place it held.
 */
export function putFavourite(
  client: QueryClient,
  food: FoodSummary,
  on: boolean,
  previous?: { index: number; row: FavouriteFoodList["foods"][number] },
): void {
  const id = food.id;
  client.setQueryData<FoodDetail>(queryKeys.foodDetail(id), (d) => (d ? { ...d, isFavourite: on } : d));
  client.setQueriesData<FoodList>({ queryKey: queryKeys.foodSearches() }, (l) =>
    mapRows(l, (row) => (row.id === id && row.isFavourite !== on ? { ...row, isFavourite: on } : row)),
  );
  client.setQueryData<FoodList>(queryKeys.foodOwn(), (l) =>
    mapRows(l, (row) => (row.id === id && row.isFavourite !== on ? { ...row, isFavourite: on } : row)),
  );
  client.setQueryData<FavouriteFoodList>(queryKeys.foodFavourites(), (l) => {
    if (!l) return l;
    const rest = l.foods.filter((f) => f.id !== id);
    if (!on) return rest.length === l.foods.length ? l : { ...l, foods: rest };
    if (rest.length !== l.foods.length) return l;
    if (previous) {
      const foods = [...rest];
      foods.splice(Math.min(previous.index, foods.length), 0, previous.row);
      return { ...l, foods };
    }
    const detail = client.getQueryData<FoodDetail>(queryKeys.foodDetail(id));
    const row = { ...food, isFavourite: true, lastAmount: detail?.lastAmount ?? null };
    return { ...l, foods: [row, ...rest] };
  });
}

/** Where food `id` sits in the cached favourites, to put it back there. */
export function favouriteRowOf(
  client: QueryClient,
  id: string,
): { index: number; row: FavouriteFoodList["foods"][number] } | undefined {
  const foods = client.getQueryData<FavouriteFoodList>(queryKeys.foodFavourites())?.foods ?? [];
  const index = foods.findIndex((f) => f.id === id);
  return index === -1 ? undefined : { index, row: foods[index] };
}
