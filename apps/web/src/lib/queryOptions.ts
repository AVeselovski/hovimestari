import { getProviders } from "@/lib/api/auth";
import { getDay } from "@/lib/api/days";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getRecents } from "@/lib/api/log";
import { getSavedMeals } from "@/lib/api/savedMeals";
import { getTargets } from "@/lib/api/targets";
import { getMe } from "@/lib/api/users";
import { forgetSeen } from "@/lib/pendingIds";
import { STALE } from "@/lib/queryClient";
import { foodSearchKey, queryKeys } from "@/lib/queryKeys";
import { keepPreviousData, queryOptions, type QueryClient } from "@tanstack/react-query";

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
 * The targets in force on `date`. The server applies the in-force rule, so
 * the client never does. While another date loads, the last answer stays on
 * screen, so the line that shows it never empties and moves what is under it.
 */
export function targetsOnQuery(date: string) {
  return queryOptions({
    queryKey: queryKeys.targetsOn(date),
    queryFn: ({ signal }) => getTargets(date, { signal }),
    placeholderData: keepPreviousData,
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
 * The foods and saved meals eaten most recently, each with its last amount.
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
 * Reads every list the log sheet's browsing shows that is stale or not held
 * yet: the recent items, the favourites, the user's own foods and the active
 * saved meals. A fresh one is not read. The Day tab calls it once its day is
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
}
