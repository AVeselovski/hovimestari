import type { Day } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// The ids of one-tap adds that are not confirmed yet (docs/design/
// days-and-logging.md, section e). An add carries an id the app chose, so
// the server applies a request sent twice once. A "+" keeps its id under the
// key of what it adds (the date, the kind and the food or meal), so a second
// press after a timeout resends the same id and cannot add a second entry.
//
// An id is let go by the first of:
// - the add's own answer (`settlePending`);
// - any day answer that holds an entry with that id (`forgetSeen`), so a
//   write that landed while its answer was lost is recognised as soon as the
//   day is read again;
// - `PENDING_ID_LIFE_MS` after it was minted.
//
// After that, the next press mints a new id, so a second shake in the
// afternoon is a second entry.
//
// An add that could not confirm holds its id for `UNCONFIRMED_HOLD_MS`
// (`holdPending`), the six seconds the log sheet's failure line shows at most.
// The add path sets the hold before it reads the day again, so neither that
// read nor its age lets the id go then. Pressing "+" again in that time
// resends the same id, also once the line has cleared sooner on a press or a
// key, and an add that did land answers as a replay, "Already logged", never
// as a second entry. Once the hold ends, an id a day answer held is let go.
// Kept per query client, as the other per-user state in lib/ is, so a
// sign-out leaves nothing behind.
// ---------------------------------------------------------------------------

/** How long an unconfirmed id is kept for its key. */
export const PENDING_ID_LIFE_MS = 60_000;

/** How long an add that could not confirm holds its id: as long as the log sheet's status message shows. */
export const UNCONFIRMED_HOLD_MS = 6_000;

interface Pending {
  id: string;
  mintedAt: number;
  /** Kept until this time, whatever else happens: its add could not confirm. */
  heldUntil?: number;
  /** A day answer held it while it was held: let go once the hold ends. */
  seen?: boolean;
}

const byClient = new WeakMap<QueryClient, Map<string, Pending>>();

function pendingOf(client: QueryClient): Map<string, Pending> {
  let map = byClient.get(client);
  if (!map) {
    map = new Map();
    byClient.set(client, map);
  }
  return map;
}

/** The key a one-tap add keeps its id under. */
export function pendingKey(date: string, kind: "food" | "saved_meal", sourceId: string): string {
  return `${date}|${kind}|${sourceId}`;
}

/** The id for an add under `key`: the unconfirmed one still alive, else a new one. */
export function pendingIdFor(client: QueryClient, key: string, now: number = Date.now()): string {
  const map = pendingOf(client);
  const held = map.get(key);
  const holding = held !== undefined && now < (held.heldUntil ?? 0);
  if (held && (holding || (!held.seen && now - held.mintedAt < PENDING_ID_LIFE_MS))) return held.id;
  const id = crypto.randomUUID();
  map.set(key, { id, mintedAt: now });
  return id;
}

/** The add with `id` was answered: its id is let go. */
export function settlePending(client: QueryClient, id: string): void {
  const map = pendingOf(client);
  for (const [key, held] of map) if (held.id === id) map.delete(key);
}

/** Keeps the pending `id` until `until`, after its add could not confirm. An id not pending is left alone. */
export function holdPending(client: QueryClient, id: string, until: number): void {
  for (const held of pendingOf(client).values()) if (held.id === id) held.heldUntil = until;
}

/** Lets go every pending id that `day` holds an entry for: those adds landed. A held one goes once its hold ends. */
export function forgetSeen(client: QueryClient, day: Day, now: number = Date.now()): void {
  const map = pendingOf(client);
  if (map.size === 0) return;
  const seen = new Set(day.entries.map((e) => e.id));
  for (const [key, held] of map) {
    if (!seen.has(held.id)) continue;
    if (now < (held.heldUntil ?? 0)) held.seen = true;
    else map.delete(key);
  }
}
