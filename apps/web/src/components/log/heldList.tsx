"use client";

import { useArmedAtRest } from "@/hooks/useArmedAtRest";
import { favouriteFoodsQuery, ownFoodsQuery, recentsQuery, savedMealsQuery } from "@/lib/queryOptions";
import { notifyManager, useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// An open list never reorders under the finger. The log sheet's lists
// (Recent, Favourites, Saved meals, Your foods) hold the order and the set of
// rows they showed while they can be pressed. A read that lands later, from
// a window coming back into focus, a returning connection, a mount or a
// write that could not confirm, changes a row in place (its star, its "Last"
// line, its busy ring) but never moves one, adds one or takes one away.
//
// A list follows its data while it cannot be pressed: while the sheet slides
// in on a phone, and while a sheet stacked on it is open. A list shown again,
// back from a food or a meal, starts from what the cache holds then, the
// person's own writes in it. A fresh open starts from what the cache holds,
// which the sheet reads once it has closed (`prefetchLogLists`).
//
// The person's own write in a stacked sheet or a rollback of one asks the
// lists to show their data where they are (`releaseHeldLists`): a meal saved
// from the stacked sheet takes its place by name as that sheet closes, and a
// favourite mark the server refused takes its row back out. A food or a saved
// meal the person's press found gone does the same, so its row leaves every
// list (`afterFoodGone`, `afterSavedMealGone`). A release makes every held
// list follow the cache at once, so a read that landed earlier shows in that
// moment. That is acceptable, because the person's own action caused it.
//
// The lists wait for one another. A list that has shown no rows yet shows
// none until every list has its first answer, from the cache or the server,
// or cannot be read (an error, or no connection). Then every list shows its
// rows in one render, and holds from there. So a list that answers late
// never pushes the others down under the finger. A list that cannot be read
// shows its line in that render too. With every list in the cache, the rows
// are there in the first render. `ListsGuard` wraps the lists, under the
// create actions. Rows that come after a wait move what was under a finger
// aimed a moment before, so from their render until `ARM_DELAY_MS` after
// their paint a press reaches nothing, as on a sheet that slides in
// (`useArmedAtRest`). So does a press that started while the lists waited.
// Rows that are there at once add no delay.
// ---------------------------------------------------------------------------

/** Where the lists are: waiting for a first answer, rows shown after a wait but not yet at rest, or rows in place. */
type ListsPhase = "waiting" | "settling" | "armed";

const Lists = createContext<{ follow: boolean; ready: boolean; phase: ListsPhase }>({
  follow: false,
  ready: true,
  phase: "armed",
});

/** The lists the log sheet's browsing shows, observed without reading them: the lists read them. */
function useEveryListAnswered(): boolean {
  const queries = useQueries({
    queries: [
      { ...recentsQuery(), enabled: false },
      { ...favouriteFoodsQuery(), enabled: false },
      { ...savedMealsQuery(false), enabled: false },
      { ...ownFoodsQuery(), enabled: false },
    ],
  });
  return queries.every((q) => q.data !== undefined || q.isError || q.fetchStatus === "paused");
}

/** How many times the held lists were asked to show their data, per query client, and who listens. */
const releases = new WeakMap<QueryClient, { count: number; listeners: Set<() => void> }>();
function releasesOf(client: QueryClient): { count: number; listeners: Set<() => void> } {
  let entry = releases.get(client);
  if (!entry) {
    entry = { count: 0, listeners: new Set() };
    releases.set(client, entry);
  }
  return entry;
}

/** Asks every held list to show its data as it now is, once. For a write of the person's own the cache rolled back. */
export function releaseHeldLists(client: QueryClient): void {
  // After the observers hear of the cache edit made before this call: TanStack tells them on its own schedule.
  notifyManager.schedule(() => {
    const entry = releasesOf(client);
    entry.count += 1;
    for (const listener of entry.listeners) listener();
  });
}

function useReleaseCount(): number {
  const client = useQueryClient();
  const subscribe = useCallback(
    (listener: () => void) => {
      const { listeners } = releasesOf(client);
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    [client],
  );
  const count = useCallback(() => releasesOf(client).count, [client]);
  return useSyncExternalStore(subscribe, count, count);
}

/** Wraps the lists of one sheet. `follow`: they cannot be pressed now, so they show their data as it is. */
export function HeldLists({ follow, children }: { follow: boolean; children: ReactNode }): ReactElement {
  const answered = useEveryListAnswered();
  // State set during render, so the render that shows the rows is the one that stops the presses.
  const [waited, setWaited] = useState(!answered);
  if (!answered && !waited) setWaited(true);
  // Rows that came after a wait move what was under the finger: presses wait as a sliding sheet's do.
  // `open` turns true in the render that shows them, which disarms; the delay runs from that commit.
  const arming = useArmedAtRest(answered && waited, waited);
  const { onOpened } = arming;
  useEffect(() => {
    if (!(answered && waited)) return;
    // At rest from the frame after the one the rows were painted in.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(onOpened, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    // Once per showing of the rows. `onOpened` only sets the hook's state.
  }, [answered, waited]);
  const phase: ListsPhase = !answered ? "waiting" : arming.armed ? "armed" : "settling";
  return <Lists.Provider value={{ follow, ready: answered, phase }}>{children}</Lists.Provider>;
}

/** True once every list has its first answer or cannot be read: a list's line that says so waits for it too. */
export function useListsReady(): boolean {
  return useContext(Lists).ready;
}

/**
 * Wraps the lists, under the create actions. A press counts while the lists
 * wait (on "Archived meals", say) and once their rows are at rest. A press
 * that started in one of those and ends in the other, or that lands while
 * rows shown after a wait settle, is stopped before it reaches anything.
 */
export function ListsGuard({ className, children }: { className?: string; children: ReactNode }): ReactElement {
  const { phase } = useContext(Lists);
  const startedIn = useRef<ListsPhase | null>(null);
  return (
    <div
      className={className}
      data-lists-guard={phase}
      onPointerDownCapture={() => {
        startedIn.current = phase;
      }}
      onClickCapture={(e) => {
        const started = startedIn.current;
        startedIn.current = null;
        if (phase !== "settling" && (started === null || started === phase)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/**
 * `items` in the order, and with the set of rows, this list first showed
 * while it could be pressed. Each row shows its latest data where `items`
 * still holds it, else the data it last showed. Undefined until `items` is,
 * and until every list has its first answer.
 */
export function useHeldList<T>(items: readonly T[] | undefined, idOf: (item: T) => string): readonly T[] | undefined {
  const { follow: follows, ready } = useContext(Lists);
  const released = useReleaseCount();
  // State set during render, so a render React throws away leaves nothing behind.
  const [held, setHeld] = useState<readonly T[] | undefined>(ready ? items : undefined);
  const [releaseSeen, setReleaseSeen] = useState(released);
  const follow = follows || released !== releaseSeen;
  if (released !== releaseSeen) setReleaseSeen(released);
  if (items === undefined) return held;
  // No rows shown yet: they show with every other list's (`HeldLists`).
  if (!ready && held === undefined) return undefined;
  if (follow || held === undefined) {
    if (items !== held) setHeld(items);
    return items;
  }
  if (items === held) return held;
  const latest = new Map(items.map((item) => [idOf(item), item]));
  return held.map((row) => latest.get(idOf(row)) ?? row);
}
