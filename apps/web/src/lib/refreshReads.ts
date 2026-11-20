import type { Me } from "@hovimestari/types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// The one way a write refreshes reads (lib/invalidation.ts says why reads in
// flight are cancelled first).
// ---------------------------------------------------------------------------

/**
 * Cancels every read under `keys`, puts the account a write answered in the
 * cache, and reads every key again. The account goes in once the cancel has
 * settled, so no read that left before the write is still out to answer
 * over it. `edit` makes any other edit at the same moment, for the same
 * reason.
 */
export async function refresh(
  client: QueryClient,
  keys: readonly QueryKey[],
  me?: Me,
  edit?: () => void,
): Promise<void> {
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
  if (me) client.setQueryData(queryKeys.me(), me);
  edit?.();
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}
