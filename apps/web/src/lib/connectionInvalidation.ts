import type { Connection } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { dropConnection, putNewConnection } from "./connectionCache";
import { queryKeys } from "./queryKeys";
import { refresh } from "./refreshReads";

// ---------------------------------------------------------------------------
// What each write to the person's connections makes stale. Callers import
// these through lib/invalidation.ts, with every other write's.
// ---------------------------------------------------------------------------

/**
 * Once a new key's reveal closes: its row (the create's answer, which holds no key) goes at the head of the list at
 * once, in the same update, so it can take focus as the reveal closes. Then the list is read again.
 */
export async function afterConnectionCreated(client: QueryClient, connection: Connection): Promise<void> {
  putNewConnection(client, connection);
  await refresh(client, [queryKeys.connections()], undefined, () => putNewConnection(client, connection));
}

/**
 * After a create that was refused or got no answer: the list is read again.
 * A key the server made before its answer was lost then shows as a row that
 * can be revoked, and a switch turned off shows in what the list offers.
 */
export async function afterConnectionCreateFailed(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.connections()]);
}

/** After a key is revoked or removed, or found already gone: its row leaves at once, then the list is read again. */
export async function afterConnectionRevoked(client: QueryClient, id: string): Promise<void> {
  await refresh(client, [queryKeys.connections()], undefined, () => dropConnection(client, id));
}

/**
 * When a connection's Activity opens: the list is read again, so the row's
 * count of changes agrees with the record the sheet reads afresh.
 */
export async function afterActivityOpened(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.connections()]);
}
