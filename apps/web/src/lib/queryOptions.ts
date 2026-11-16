import { getProviders } from "@/lib/api/auth";
import { getDay } from "@/lib/api/days";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { getTargets } from "@/lib/api/targets";
import { getMe } from "@/lib/api/users";
import { STALE } from "@/lib/queryClient";
import { foodSearchKey, queryKeys } from "@/lib/queryKeys";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

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
    queryFn: ({ signal }) => getDay(date, { signal }),
    staleTime: STALE.live,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
