import type { Me } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// What each write makes stale, in one place, so a screen never guesses which
// reads to refresh. One function per kind of write. Later steps add theirs.
// ---------------------------------------------------------------------------

/**
 * After an account change: a sign-in method added or removed, Google linked
 * or the password changed. A write that answers the account puts it in the
 * cache at once, and the read is refreshed either way.
 */
export async function afterAccountChange(client: QueryClient, me?: Me): Promise<void> {
  if (me) client.setQueryData(queryKeys.me(), me);
  await client.invalidateQueries({ queryKey: queryKeys.me() });
}
