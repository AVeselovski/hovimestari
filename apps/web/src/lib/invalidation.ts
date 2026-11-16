import type { FoodDetail, Me, Portion } from "@hovimestari/types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { dropFood, dropPortion, putNewFoodInSearches, putNewOwnFood, putPortion, putSavedFood } from "./foodCache";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// What each write makes stale, in one place, so a screen never guesses which
// reads to refresh. One function per kind of write. Later steps add theirs.
//
// Every refresh first cancels the reads still on their way. A read that left
// before the write was stored answers the old state, and an invalidation
// joins a running read instead of starting a new one while the query holds
// no data yet. So a write that answers while the first read is out (the
// device's time zone at app start does, often) would leave that old answer
// in place. Cancelled first, the read that follows always starts after the
// write.
// ---------------------------------------------------------------------------

/**
 * Cancels every read under `keys`, puts the account a write answered in the
 * cache, and reads every key again. The account goes in after the cancel,
 * because a cancel puts back what the cache held before the read started.
 */
async function refresh(client: QueryClient, keys: readonly QueryKey[], me?: Me): Promise<void> {
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
  if (me) client.setQueryData(queryKeys.me(), me);
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/**
 * After an account change: a sign-in method added or removed, Google linked
 * or the password changed. A write that answers the account puts it in the
 * cache at once, and the read is refreshed either way.
 */
export async function afterAccountChange(client: QueryClient, me?: Me): Promise<void> {
  await refresh(client, [queryKeys.me()], me);
}

/** After a targets change is saved or removed: every targets read, today's and each date's. */
export async function afterTargetsChange(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.targets()]);
}

/**
 * After the food-name language changes: the account, and every food name,
 * which the server answers in it. A food read not on screen is dropped, so
 * no list can come back in the old language while its read is out.
 */
export async function afterFoodNameLanguageChange(client: QueryClient, me: Me): Promise<void> {
  client.removeQueries({ queryKey: queryKeys.foods(), type: "inactive" });
  await refresh(client, [queryKeys.me(), queryKeys.foods()], me);
}

/** After the device's time zone is stored: the account, and "today", which every targets read answers. */
export async function afterTimeZoneChange(client: QueryClient, me: Me): Promise<void> {
  await refresh(client, [queryKeys.me(), queryKeys.targets()], me);
}

/**
 * Cancels every food read, makes the write's edits to the cache, then reads
 * again what the edits could not settle. The edits go in after the cancel,
 * because a cancel puts back what the cache held before the read started.
 */
async function editFoods(client: QueryClient, edit: () => void, refetch: () => Promise<unknown>): Promise<void> {
  await client.cancelQueries({ queryKey: queryKeys.foods() });
  edit();
  await refetch();
}

/** How a save changed the user's own food. */
export type OwnFoodChange = "added" | "renamed" | "edited";

/**
 * After the user's own food is saved. Its answer goes into its detail and
 * into its row in every cached list at once, so a list that comes back shows
 * the new name and figures before its read lands. Every food read is then
 * read again, for an order a new name changes.
 *
 * A new food goes into the cached own foods at its place in their order. A
 * new name changes which searches find the food, for a new food and a
 * renamed one alike. A search that found nothing for exactly the new name
 * gets the food as its one result. Every other cached search is dropped
 * when off screen, and read afresh when on it, so none can come back with
 * the food where it no longer matches or without it where it now does.
 */
export async function afterOwnFoodSaved(client: QueryClient, food: FoodDetail, change: OwnFoodChange): Promise<void> {
  await editFoods(
    client,
    () => {
      putSavedFood(client, food);
      if (change === "added") putNewOwnFood(client, food);
      if (change === "edited") return;
      const written = putNewFoodInSearches(client, food);
      const other = { predicate: (q: { queryKey: QueryKey }) => !written.has(JSON.stringify(q.queryKey)) };
      client.removeQueries({ queryKey: queryKeys.foodSearches(), type: "inactive", ...other });
      void client.resetQueries({ queryKey: queryKeys.foodSearches(), type: "active", ...other });
    },
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.foods() }),
        // Read at once, also while not on screen, for its order.
        change === "added" && client.invalidateQueries({ queryKey: queryKeys.foodOwn(), refetchType: "all" }),
      ]),
  );
}

/**
 * After a food is deleted, or turns out to be gone: its detail is dropped
 * and its row leaves every cached list at once, so no list can offer it
 * again. The rest is read again.
 */
export async function afterFoodGone(client: QueryClient, id: string): Promise<void> {
  await editFoods(
    client,
    () => dropFood(client, id),
    () => client.invalidateQueries({ queryKey: queryKeys.foods() }),
  );
}

/**
 * After a portion is saved: the answered portion goes into the food's cached
 * detail at once, a new one added and an edited one replaced, then the
 * detail is read again.
 */
export async function afterPortionSaved(client: QueryClient, foodId: string, portion: Portion): Promise<void> {
  const key = queryKeys.foodDetail(foodId);
  await editFoodDetail(client, key, () => putPortion(client, foodId, portion));
}

/**
 * After a portion is deleted, or found gone: it leaves the food's cached
 * detail at once, so it can no longer be opened, then the detail is read
 * again.
 */
export async function afterPortionDeleted(client: QueryClient, foodId: string, portionId: string): Promise<void> {
  const key = queryKeys.foodDetail(foodId);
  await editFoodDetail(client, key, () => dropPortion(client, foodId, portionId));
}

/** Cancels the detail's read on its way, makes the edit, and reads the detail again. */
async function editFoodDetail(client: QueryClient, key: QueryKey, edit: () => void): Promise<void> {
  await client.cancelQueries({ queryKey: key, exact: true });
  edit();
  await client.invalidateQueries({ queryKey: key, exact: true });
}

/**
 * After a favourite mark has settled: the food's detail and the favourites
 * list, for the figures only the server knows, such as the last amount.
 * The searches and the own foods keep their order: the mark already flipped
 * their stars in place (`putFavourite`), and a list read again now would
 * re-rank under the thumb.
 */
export async function afterFavourite(client: QueryClient, foodId: string): Promise<void> {
  await refresh(client, [queryKeys.foodDetail(foodId), queryKeys.foodFavourites()]);
}
