import type { Me } from "@hovimestari/types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// What each write makes stale, in one place, so a screen never guesses which
// reads to refresh. One function per kind of write. Later steps add theirs.
//
// Every refresh first cancels the reads still on their way. A read that left
// before the write was stored answers the old state, and an invalidation
// joins a running read instead of starting a new one while the query holds
// no data yet. So a write that answers while the first read is out (the
// device's time zone at app start does, often) would leave that old answer
// in place. Cancelled first, the read that follows always starts after the
// write.
// ---------------------------------------------------------------------------

/**
 * Cancels every read under `keys`, puts the account a write answered in the
 * cache, and reads every key again. The account goes in after the cancel,
 * because a cancel puts back what the cache held before the read started.
 */
async function refresh(client: QueryClient, keys: readonly QueryKey[], me?: Me): Promise<void> {
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
  if (me) client.setQueryData(queryKeys.me(), me);
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/**
 * After an account change: a sign-in method added or removed, Google linked
 * or the password changed. A write that answers the account puts it in the
 * cache at once, and the read is refreshed either way.
 */
export async function afterAccountChange(client: QueryClient, me?: Me): Promise<void> {
  await refresh(client, [queryKeys.me()], me);
}

/** After a targets change is saved or removed: every targets read, today's and each date's. */
export async function afterTargetsChange(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.targets()]);
}

/** After the food-name language changes: the account, and every food name, which the server answers in it. */
export async function afterFoodNameLanguageChange(client: QueryClient, me: Me): Promise<void> {
  await refresh(client, [queryKeys.me(), queryKeys.foods()], me);
}

/** After the device's time zone is stored: the account, and "today", which every targets read answers. */
export async function afterTimeZoneChange(client: QueryClient, me: Me): Promise<void> {
  await refresh(client, [queryKeys.me(), queryKeys.targets()], me);
}
