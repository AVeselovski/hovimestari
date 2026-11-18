import { releaseHeldLists } from "@/components/log/heldList";
import type { Day, FoodDetail, Me, Portion, SavedMeal } from "@hovimestari/types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { dropFood, dropPortion, putNewFoodInSearches, putNewOwnFood, putPortion, putSavedFood } from "./foodCache";
import { dropMeal, putMeal, putNewMeal, takeMealOutOf } from "./mealCache";
import { forgetSeen } from "./pendingIds";
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

/**
 * After a targets change is saved or removed: the targets read and every day, which answers the targets in force and the
 * positions against them. The days are read even off screen. Targets change in Settings or the first run, where no day
 * is shown, and a day only marked stale would open with the old targets and change height as its read lands. A day
 * that only an entry write put in the cache has no read of its own, and stays marked stale.
 */
export async function afterTargetsChange(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.targets(), queryKeys.days()]);
  await client.refetchQueries({
    queryKey: queryKeys.days(),
    type: "inactive",
    predicate: (query) => typeof query.options.queryFn === "function",
  });
}

/**
 * After the food-name language changes: the account, and every food name,
 * which the server answers in it, also inside a day's entries and recent
 * items. A food read not on screen is dropped, so no list can come back in
 * the old language while its read is out.
 */
export async function afterFoodNameLanguageChange(client: QueryClient, me: Me): Promise<void> {
  client.removeQueries({ queryKey: queryKeys.foods(), type: "inactive" });
  await refresh(client, [queryKeys.me(), queryKeys.foods(), queryKeys.days(), queryKeys.log()], me);
}

/** After the device's time zone is stored: the account, and "today", which every targets and day read answers. */
export async function afterTimeZoneChange(client: QueryClient, me: Me): Promise<void> {
  // Writes still out were sent in the old zone: their answers no longer go into the cache.
  zoneChanges.set(client, zoneEpoch(client) + 1);
  await refresh(client, [queryKeys.me(), queryKeys.targets(), queryKeys.days()], me);
}

/**
 * Cancels every food read, makes the write's edits to the cache, then reads
 * again what the edits could not settle. The edits go in after the cancel,
 * because a cancel puts back what the cache held before the read started.
 */
async function editFoods(client: QueryClient, edit: () => void, refetch: () => Promise<unknown>): Promise<void> {
  await client.cancelQueries({ queryKey: queryKeys.foods() });
  edit();
  await refetch();
}

/** How a save changed the user's own food. */
export type OwnFoodChange = "added" | "renamed" | "edited";

/**
 * After the user's own food is saved. Its answer goes into its detail and
 * into its row in every cached list at once, so a list that comes back shows
 * the new name and figures before its read lands. Every food read is then
 * read again, for an order a new name changes.
 *
 * A new food goes into the cached own foods at its place in their order. A
 * new name changes which searches find the food, for a new food and a
 * renamed one alike. A search that found nothing for exactly the new name
 * gets the food as its one result. Every other cached search is dropped
 * when off screen, and read afresh when on it, so none can come back with
 * the food where it no longer matches or without it where it now does.
 */
export async function afterOwnFoodSaved(client: QueryClient, food: FoodDetail, change: OwnFoodChange): Promise<void> {
  await editFoods(
    client,
    () => {
      putSavedFood(client, food);
      if (change === "added") putNewOwnFood(client, food);
      if (change === "edited") return;
      const written = putNewFoodInSearches(client, food);
      const other = { predicate: (q: { queryKey: QueryKey }) => !written.has(JSON.stringify(q.queryKey)) };
      client.removeQueries({ queryKey: queryKeys.foodSearches(), type: "inactive", ...other });
      void client.resetQueries({ queryKey: queryKeys.foodSearches(), type: "active", ...other });
    },
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.foods() }),
        // Read at once, also while not on screen, for its order.
        change === "added" && client.invalidateQueries({ queryKey: queryKeys.foodOwn(), refetchType: "all" }),
        // Its planned entries from today on take its new values.
        change !== "added" && afterFoodChangeOnDays(client),
      ]),
  );
}

/**
 * After a food is deleted, or turns out to be gone: its detail is dropped
 * and its row leaves every cached list at once, so no list can offer it
 * again, an open list that holds its rows too (`releaseHeldLists`). The rest
 * is read again.
 */
export async function afterFoodGone(client: QueryClient, id: string): Promise<void> {
  await editFoods(
    client,
    () => {
      dropFood(client, id);
      releaseHeldLists(client);
    },
    () => Promise.all([client.invalidateQueries({ queryKey: queryKeys.foods() }), afterFoodChangeOnDays(client)]),
  );
}

/**
 * After a portion is saved: the answered portion goes into the food's cached
 * detail at once, a new one added and an edited one replaced, then the
 * detail is read again.
 */
export async function afterPortionSaved(client: QueryClient, foodId: string, portion: Portion): Promise<void> {
  const key = queryKeys.foodDetail(foodId);
  await editFoodDetail(client, key, () => putPortion(client, foodId, portion));
}

/**
 * After a portion is deleted, or found gone: it leaves the food's cached
 * detail at once, so it can no longer be opened, then the detail is read
 * again.
 */
export async function afterPortionDeleted(client: QueryClient, foodId: string, portionId: string): Promise<void> {
  const key = queryKeys.foodDetail(foodId);
  await editFoodDetail(client, key, () => dropPortion(client, foodId, portionId));
}

/** Cancels the detail's read on its way, makes the edit, and reads the detail again. */
async function editFoodDetail(client: QueryClient, key: QueryKey, edit: () => void): Promise<void> {
  await client.cancelQueries({ queryKey: key, exact: true });
  edit();
  await client.invalidateQueries({ queryKey: key, exact: true });
}

/**
 * After a favourite mark has settled: the food's detail and the favourites
 * list, for the figures only the server knows, such as the last amount.
 * The searches and the own foods keep their order: the mark already flipped
 * their stars in place (`putFavourite`), and a list read again now would
 * re-rank under the thumb.
 */
export async function afterFavourite(client: QueryClient, foodId: string): Promise<void> {
  await refresh(client, [queryKeys.foodDetail(foodId), queryKeys.foodFavourites()]);
}

// ---------------------------------------------------------------------------
// Days and logging. A write answers every day it changed, so the answer goes
// into the cache first and the reads that follow only settle what it could
// not: ranges, recent items and last amounts.
// ---------------------------------------------------------------------------

/**
 * After an entry write. Each answered day goes into the cache under its own
 * date, after the reads still out for it are cancelled, so a read that left
 * before the write cannot land after it. The answers carry `today`, which
 * `TodayProvider` reads from the cache. When the answer holds no day for the
 * date on screen (a mark that changed nothing answers no days), that day is
 * read again, so the row shows what the server holds. An answered day whose
 * `today` is older than the app's (`appToday`) was answered before midnight,
 * so its `relation` and `unmarkedCount` are stale: it is read again too. Then
 * the ranges, recent items, saved meals, favourites and food details, whose
 * last amounts follow eaten entries.
 *
 * Resolves once the answered days are in the cache, and gives the reads that
 * follow as `settled`: a write's toast and its row's state never wait for an
 * unrelated read.
 */
export async function afterEntryWrite(
  client: QueryClient,
  days: readonly Day[],
  shownDate?: string,
  appToday?: string | null,
  sentInZone?: number,
): Promise<{ settled: Promise<void> }> {
  // Sent before the account's zone changed: its days, and the today they
  // carry, are the old zone's. They are read again instead.
  const oldZone = sentInZone !== undefined && sentInZone !== zoneEpoch(client);
  await Promise.all(days.map((d) => client.cancelQueries({ queryKey: queryKeys.day(d.date), exact: true })));
  if (!oldZone) for (const day of days) client.setQueryData(queryKeys.day(day.date), day);
  // An add whose answer was lost earlier is in one of these days: its id is let go.
  for (const day of days) forgetSeen(client, day);
  const reread = shownDate !== undefined && !days.some((d) => d.date === shownDate) ? [queryKeys.day(shownDate)] : [];
  const stale = oldZone
    ? days.map((d) => queryKeys.day(d.date))
    : appToday
      ? days.filter((d) => d.today < appToday).map((d) => queryKeys.day(d.date))
      : [];
  const settled = refresh(client, [
    ...reread,
    ...stale,
    queryKeys.dayRanges(),
    queryKeys.log(),
    queryKeys.savedMeals(),
    queryKeys.foodFavourites(),
    queryKeys.foodDetails(),
  ]);
  return { settled };
}

/**
 * After an add that could not confirm: no answer came, it timed out or the
 * server faulted, so it may have landed. Its day and the ranges are read
 * again, so an entry that did land shows with both totals at once. The
 * recent items, and with `meal`, for a "Save and log", the saved meals, are
 * only marked stale: they are lists the open log sheet shows, and a read now
 * could move a row under the finger that presses again. They are read once
 * the sheet has closed (`prefetchLogLists`), so the next open shows them. One
 * read: a read that fails is not tried again from here.
 */
export async function afterAddUnconfirmed(client: QueryClient, date: string, meal = false): Promise<void> {
  const lists = [queryKeys.log(), ...(meal ? [queryKeys.savedMeals()] : [])];
  // A list read already out answers the state before the add, and would clear the mark as it lands.
  await Promise.all(lists.map((queryKey) => client.cancelQueries({ queryKey })));
  await Promise.all([
    refresh(client, [queryKeys.day(date), queryKeys.dayRanges()]),
    ...lists.map((queryKey) => client.invalidateQueries({ queryKey, refetchType: "none" })),
  ]);
}

/** How many times the account's time zone changed, per client. */
const zoneChanges = new WeakMap<QueryClient, number>();

/**
 * The account's time zone, as a count of its changes. An entry write takes it
 * when it is sent and gives it to `afterEntryWrite`, which leaves an answer
 * from before a zone change out of the cache.
 */
export function zoneEpoch(client: QueryClient): number {
  return zoneChanges.get(client) ?? 0;
}

/** The entry writes still out, per date, and whether two of them overlapped on it. */
const writesOut = new WeakMap<QueryClient, Map<string, { count: number; overlapped: boolean }>>();

/**
 * Before an entry write is sent: counts it against each date it may answer.
 * Two writes out at once on one date can answer in either order, and the
 * older answer, landing last, would put back the older day. So when the last
 * of overlapping writes on a date settles, that day is read again once. Call
 * the function it returns when the write has settled, its answer in the cache
 * or failed.
 */
export function beginEntryWrite(client: QueryClient, dates: readonly string[]): () => void {
  let byDate = writesOut.get(client);
  if (!byDate) {
    byDate = new Map();
    writesOut.set(client, byDate);
  }
  const own = [...new Set(dates)];
  for (const date of own) {
    const out = byDate.get(date) ?? { count: 0, overlapped: false };
    if (out.count > 0) out.overlapped = true;
    out.count += 1;
    byDate.set(date, out);
  }
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    for (const date of own) {
      const out = byDate.get(date);
      if (!out) continue;
      out.count -= 1;
      if (out.count > 0) continue;
      byDate.delete(date);
      if (out.overlapped) void client.invalidateQueries({ queryKey: queryKeys.day(date), exact: true });
    }
  };
}

/**
 * After the server's today moved to a new date: every day answered under the
 * old today holds an old `relation` and `unmarkedCount`, so every day and
 * every targets read is read again.
 */
export async function afterDayChange(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.targets(), queryKeys.days()]);
}

/**
 * After the user's own food changed or went away: its planned entries from
 * today on take its new values, and a hidden food leaves recent items.
 */
export async function afterFoodChangeOnDays(client: QueryClient): Promise<void> {
  await refresh(client, [queryKeys.days(), queryKeys.log()]);
}

// ---------------------------------------------------------------------------
// Saved meals. A write's answer goes into the lists in place first, so a row
// never moves under the thumb, then the lists are read again for what only
// the server knows: a new meal's place in the Finnish order, last counts.
// ---------------------------------------------------------------------------

/** Cancels the saved meal and log reads on their way, makes the edit, and reads `keys` again. */
async function editMeals(client: QueryClient, edit: () => void, keys: readonly QueryKey[]): Promise<void> {
  await Promise.all([queryKeys.savedMeals(), queryKeys.log()].map((queryKey) => client.cancelQueries({ queryKey })));
  edit();
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/**
 * After a new meal is saved without logging: its answer goes into the active
 * meals at its place by name, then the lists are read again. Resolves once
 * the meal is in the cache, so the sheet that saved it can close after, and
 * gives the read as `settled`. Also, with no answer, after a "Save meal" that
 * could not confirm, which may have landed. A "Save and log" that could not
 * confirm is an add (`afterAddUnconfirmed`).
 */
export async function afterSavedMealCreated(
  client: QueryClient,
  meal?: SavedMeal,
): Promise<{ settled: Promise<void> }> {
  await client.cancelQueries({ queryKey: queryKeys.savedMeals() });
  if (meal) putNewMeal(client, meal);
  return { settled: client.invalidateQueries({ queryKey: queryKeys.savedMeals() }) };
}

/**
 * After a meal is edited: the answer replaces its row in place in both lists
 * and the recent items. Its planned entries from today on took the new
 * figures, so the days are read again, and the log for its rows.
 */
export async function afterSavedMealChange(client: QueryClient, meal: SavedMeal): Promise<void> {
  await editMeals(client, () => putMeal(client, meal), [queryKeys.savedMeals(), queryKeys.days(), queryKeys.log()]);
}

/**
 * After a meal is archived or restored: it leaves the list it was in, in
 * place. The lists and the recent items are read again, which leave an
 * archived meal out of recent items.
 */
export async function afterSavedMealArchived(client: QueryClient, id: string, archived: boolean): Promise<void> {
  await editMeals(client, () => takeMealOutOf(client, id, !archived), [queryKeys.savedMeals(), queryKeys.log()]);
}

/** After a meal is deleted, or found gone: it leaves both lists and the recent items, in place. */
export async function afterSavedMealGone(client: QueryClient, id: string): Promise<void> {
  const drop = (): void => {
    dropMeal(client, id);
    // An open list that holds its rows lets the meal go too.
    releaseHeldLists(client);
  };
  await editMeals(client, drop, [queryKeys.savedMeals(), queryKeys.days(), queryKeys.log()]);
}
