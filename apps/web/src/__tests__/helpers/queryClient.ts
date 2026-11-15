import { qk } from "@/lib/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

/**
 * A query client for one test: no retries, and no garbage collection, so no
 * timer is left running when the test ends.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

const liveClients = new Set<QueryClient>();

/** Tracks a client so `clearTestQueryClients` (run after every test by `setup.ts`) clears it. */
export function registerTestQueryClient(client: QueryClient): QueryClient {
  liveClients.add(client);
  return client;
}

export function clearTestQueryClients(): void {
  for (const client of liveClients) client.clear();
  liveClients.clear();
}

/**
 * Matches the trailing `{ signal }` a read helper or `api.get` receives from
 * a query function: `expect(listTags).toHaveBeenCalledWith(VAULT_ID, undefined, withSignal)`.
 */
export const withSignal = expect.objectContaining({ signal: expect.any(AbortSignal) });

/** A promise with its `resolve` and `reject` handed out, for answering a request at a moment the test picks. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A `wrapper` that renders under `client`, for a test that inspects the cache
 * or makes a write through it: `render(<Card />, { wrapper: queryWrapper(client) })`,
 * then `await act(async () => afterLedgerWrite(client, VAULT_ID))`.
 */
export function queryWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

/**
 * How many times the calls a spy on `client.invalidateQueries` recorded
 * refreshed the vault's ledger reads, by their shared prefix. One write is
 * one: `expect(ledgerInvalidations(spy, VAULT_ID)).toBe(1)`.
 */
export function ledgerInvalidations(spy: jest.SpyInstance, vaultId: string): number {
  const ledger = JSON.stringify(qk.ledger(vaultId));
  return spy.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === ledger).length;
}
