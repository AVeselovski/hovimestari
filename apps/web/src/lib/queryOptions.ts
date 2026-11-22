import { getProviders } from "@/lib/api/auth";
import { getConnectionChanges, getConnections } from "@/lib/api/connections";
import { getDay, getDaySummaries } from "@/lib/api/days";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getRecipe, getRecipes } from "@/lib/api/recipes";
import { getSavedMeals } from "@/lib/api/savedMeals";
import { getTargets } from "@/lib/api/targets";
import { getMe } from "@/lib/api/users";
import { forgetSeen } from "@/lib/pendingIds";
import { STALE } from "@/lib/queryClient";
import { foodSearchKey, queryKeys } from "@/lib/queryKeys";
import { infiniteQueryOptions, keepPreviousData, queryOptions, type QueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// The options for every read, built once: the key, the fetch and how long
// the result stays fresh. Components call `useQuery(meQuery())` and never
// assemble a key or a fetch themselves.
// ---------------------------------------------------------------------------

/** The signed-in user. Fresh until an account change invalidates it. */
export function meQuery() {
  return queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => getMe({ signal }),
    staleTime: Infinity,
  });
}

/** Which sign-in providers this deployment offers. It changes only with a deploy. */
export function providersQuery() {
  return queryOptions({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => getProviders({ signal }),
    staleTime: Infinity,
  });
}

/**
 * The user's connections and what the server offers now. Read again when the
 * page is shown, so a key's last use and expiry follow the server.
 */
export function connectionsQuery() {
  return queryOptions({
    queryKey: queryKeys.connections(),
    queryFn: ({ signal }) => getConnections({ signal }),
    refetchOnWindowFocus: true,
  });
}

/**
 * One connection's record of changes, newest first, a page at a time, for
 * one open of the Activity sheet (`open` counts the opens). Read fresh on
 * every open and never again while it is open: a change that lands meanwhile
 * shows on the next open, at the top, and never moves or repeats a row
 * already on screen. The pages after the first are read only by Show more.
 * An open's pages are forgotten once the next open replaces it.
 */
export function connectionChangesQuery(id: string, open: number) {
  return infiniteQueryOptions({
    queryKey: queryKeys.connectionChanges(id, open),
    queryFn: ({ pageParam, signal }) => getConnectionChanges(id, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * The targets in force on the user's today, every change and today itself.
 * Read again when the page is shown or the connection returns, so "today"
 * follows the server across midnight (components/targets/TodayProvider.tsx).
 */
export function targetsQuery() {
  return queryOptions({
    queryKey: queryKeys.targets(),
    queryFn: ({ signal }) => getTargets(undefined, { signal }),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * The search results for `q`. The signal is handed to the request, so a query
 * that a newer one replaces, and so loses its last observer, is aborted.
 * While the next query loads, the last results stay on screen, so the list
 * never flashes empty.
 */
export function foodSearchQuery(q: string) {
  const key = foodSearchKey(q);
  return queryOptions({
    queryKey: queryKeys.foodSearch(key),
    queryFn: ({ signal }) => searchFoods(key, { signal }),
    placeholderData: keepPreviousData,
    // Back from a food's detail mounts the results again. Within this time
    // they come from the cache as they were, with no request.
    staleTime: STALE.live,
  });
}

/** One food with its portions. */
export function foodDetailQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.foodDetail(id),
    queryFn: ({ signal }) => getFood(id, { signal }),
  });
}

/** The user's favourites, newest first. */
export function favouriteFoodsQuery() {
  return queryOptions({
    queryKey: queryKeys.foodFavourites(),
    queryFn: ({ signal }) => getFavouriteFoods({ signal }),
  });
}

/** The user's own foods, in alphabetical order. */
export function ownFoodsQuery() {
  return queryOptions({
    queryKey: queryKeys.foodOwn(),
    queryFn: ({ signal }) => getOwnFoods({ signal }),
  });
}

// Days and logging -----------------------------------------------------------

/**
 * One day by its date. Fresh for 30 seconds, and read again when the page is
 * shown or the connection returns, since another device may have logged to
 * it. The `today` it answers moves the app's today forward when it is newer
 * (`TodayProvider` watches the cache).
 */
export function dayQuery(date: string) {
  return queryOptions({
    queryKey: queryKeys.day(date),
    queryFn: async ({ signal, client }) => {
      const day = await getDay(date, { signal });
      // An add that landed while its answer was lost lets go of its id.
      forgetSeen(client, day);
      return day;
    },
    staleTime: STALE.live,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * The day summaries from `from` to `to`, both included, without entries: a
 * week in the week sheet. Fresh for 30 seconds, and read again when the page
 * is shown or the connection returns, as a day is. An entry write puts each
 * day it answers into every cached range at once (`putDaysInRanges`).
 */
export function dayRangeQuery(from: string, to: string) {
  return queryOptions({
    queryKey: queryKeys.dayRange(from, to),
    queryFn: ({ signal }) => getDaySummaries(from, to, { signal }),
    staleTime: STALE.live,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * The foods, saved meals and recipes eaten most recently, each with its last amount.
 * Read again when the page is shown or the connection returns, as a day is,
 * since another device may have logged.
 */
export function recentsQuery() {
  return queryOptions({
    queryKey: queryKeys.recents(),
    queryFn: ({ signal }) => getRecents({ signal }),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * The user's saved meals by name: the active ones, or the archived ones. The
 * log sheet filters them on the device, by name and source, so one read
 * serves browsing and every search.
 */
export function savedMealsQuery(archived: boolean) {
  return queryOptions({
    queryKey: queryKeys.savedMealList(archived),
    queryFn: ({ signal }) => getSavedMeals(archived, { signal }),
  });
}

/**
 * The user's recipes: the active ones, or the archived ones. The Recipes tab
 * filters and sorts them on the device, so one read serves every search,
 * chip and sort, and the log sheet's Recipes list and its search too. Their figures follow their foods, so a food write reads
 * them again.
 */
export function recipesQuery(archived: boolean) {
  return queryOptions({
    queryKey: queryKeys.recipeList(archived),
    queryFn: ({ signal }) => getRecipes(archived, { signal }),
  });
}

/** One recipe with its lines, steps and notes, for its page and the editor. */
export function recipeQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.recipeDetail(id),
    queryFn: ({ signal }) => getRecipe(id, { signal }),
  });
}

/**
 * Reads every list the log sheet's browsing shows that is stale or not held
 * yet: the recent items, the favourites, the user's own foods, the active
 * saved meals and the active recipes. A fresh one is not read. The Day tab calls it once its day is
 * on screen, and the log sheet once it has closed, so the next open shows
 * what a write left stale while the sheet held its lists
 * (components/log/heldList.tsx). These reads take no abort signal: a read
 * whose signal is taken is cancelled when the last list showing it unmounts,
 * as the closing sheet's lists do.
 */
export function prefetchLogLists(client: QueryClient): void {
  void client.prefetchQuery({ ...recentsQuery(), queryFn: () => getRecents() });
  void client.prefetchQuery({ ...favouriteFoodsQuery(), queryFn: () => getFavouriteFoods() });
  void client.prefetchQuery({ ...ownFoodsQuery(), queryFn: () => getOwnFoods() });
  void client.prefetchQuery({ ...savedMealsQuery(false), queryFn: () => getSavedMeals(false) });
  void client.prefetchQuery({ ...recipesQuery(false), queryFn: () => getRecipes(false) });
}
