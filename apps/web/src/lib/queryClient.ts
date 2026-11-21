import { QueryClient, type QueryState } from "@tanstack/react-query";
import { isAxiosError } from "axios";

/**
 * How long a read stays fresh. Freshness after this device's own writes comes
 * from invalidating the keys a write changes, so `staleTime` only bounds how
 * late a write from another device shows up.
 */
export const STALE = { live: 30_000, catalog: 5 * 60_000 } as const;

/**
 * Whether a cached read can open a form as it is: it holds an answer, read
 * within the live stale time, not marked stale since and not being read
 * again now. Otherwise the form's opener reads first, so a save never
 * writes an older copy over a change made elsewhere.
 */
export function isFreshRead(
  state: Pick<QueryState, "data" | "isInvalidated" | "fetchStatus" | "dataUpdatedAt"> | undefined,
): boolean {
  return (
    state?.data !== undefined &&
    !state.isInvalidated &&
    state.fetchStatus === "idle" &&
    Date.now() - state.dataUpdatedAt < STALE.live
  );
}

/** One retry, only for a request that never got an answer. Never on a response (4xx, 5xx), a timeout or a cancel. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isAxiosError(error) && !error.response && error.code === "ERR_NETWORK";
}

/** The app's query client. One per signed-in user (see `components/QueryProvider.tsx`). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.live,
        gcTime: 10 * 60_000,
        retry: shouldRetry,
        retryDelay: 1_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  });
}
