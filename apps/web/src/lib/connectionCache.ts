import type { Connection, ConnectionList } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// Edits to the cached connections list from a connection write's own answer.
// `lib/invalidation.ts` calls them. The list never holds a key.

/** Puts a new connection at the head of the list, once. */
export function putNewConnection(client: QueryClient, connection: Connection): void {
  client.setQueryData<ConnectionList>(queryKeys.connections(), (prev) =>
    prev ? { ...prev, connections: [connection, ...prev.connections.filter((c) => c.id !== connection.id)] } : prev,
  );
}

/** Takes a connection off the list. */
export function dropConnection(client: QueryClient, id: string): void {
  client.setQueryData<ConnectionList>(queryKeys.connections(), (prev) =>
    prev ? { ...prev, connections: prev.connections.filter((c) => c.id !== id) } : prev,
  );
}
