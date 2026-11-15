import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

/**
 * How long a read stays fresh. Freshness after this device's own writes comes
 * from invalidation (`lib/invalidation.ts`), so `staleTime` only bounds how
 * late another member's write shows up.
 */
export const STALE = { ledger: 30_000, catalog: 5 * 60_000 } as const;

/** One retry, only for a request that never got an answer. Never on a response (4xx, 5xx), a timeout or a cancel. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isAxiosError(error) && !error.response && error.code === "ERR_NETWORK";
}

/** The app's query client. One per signed-in user (see `components/QueryProvider.tsx`). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.ledger,
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
