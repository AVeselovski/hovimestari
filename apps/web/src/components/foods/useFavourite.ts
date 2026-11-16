"use client";

import { setFavourite } from "@/lib/api/foods";
import { favouriteRowOf, putFavourite } from "@/lib/foodCache";
import { afterFavourite } from "@/lib/invalidation";
import { queryKeys } from "@/lib/queryKeys";
import type { FoodSummary } from "@hovimestari/types";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Marking a favourite, optimistically. The star, the food's detail, every
// cached row of the food and the favourites list flip at once, in place
// (`putFavourite`). A failure puts back this food's own prior state and
// nothing else, so a mark of another food, or a list read since, stands.
//
// Marks of one food run one after another (`scope`), so a quick second tap
// never reaches the server before the first. Only the last mark of a food
// rolls back or reads again: an earlier one that fails is overtaken by the
// later taps, which set the state the user left.
//
// A rollback goes to what the server last confirmed for the food, not to
// what the star showed before the failed tap: after a tap that worked and
// two that failed, the server holds the first tap's state. The searches and
// the own foods it writes into are marked stale, so the next time one shows
// it reads the server's state again.
//
// A mark fails at once without a network (`networkMode: "always"`), as every
// other write here does, so the star goes back and the line says why. Queued
// for later, it would be lost if the app closed first.
// ---------------------------------------------------------------------------

/** A food's favourite state, and its place in the favourites, to put back on a failure. */
interface Prior {
  on: boolean;
  favouriteRow: ReturnType<typeof favouriteRowOf>;
}

export interface FavouriteToggle {
  /** Marks or unmarks `food`. */
  toggle: (food: FoodSummary, on: boolean) => void;
  /** The last mark's failure, or null. */
  error: unknown;
  /** What a mark still on its way sets the star to, or null when none is. Shown at once, before any cache moves. */
  pending: boolean | null;
}

/** The key every mark of `foodId` runs under, also its scope. */
const markKey = (foodId: string) => ["favourite", foodId] as const;

/**
 * What the server last confirmed for each food with a mark on its way, per
 * query client: the state before the first of those marks, then each mark
 * that worked. Cleared once the last mark has settled, so a list read later
 * decides again.
 */
const confirmedByClient = new WeakMap<QueryClient, Map<string, Prior>>();
function confirmedOf(client: QueryClient): Map<string, Prior> {
  let confirmed = confirmedByClient.get(client);
  if (!confirmed) {
    confirmed = new Map();
    confirmedByClient.set(client, confirmed);
  }
  return confirmed;
}

export function useFavourite(foodId: string): FavouriteToggle {
  const client = useQueryClient();
  /** True when no later mark of this food is on its way. */
  const isLast = (id: string) => client.isMutating({ mutationKey: markKey(id) }) <= 1;
  const mutation = useMutation({
    mutationKey: markKey(foodId),
    scope: { id: `favourite:${foodId}` },
    networkMode: "always",
    mutationFn: ({ food, on }: { food: FoodSummary; on: boolean }) => setFavourite(food.id, on),
    onMutate: async ({ food, on }): Promise<void> => {
      // The first mark of a run: the star shows what the server holds.
      const confirmed = confirmedOf(client);
      if (!confirmed.has(food.id)) confirmed.set(food.id, { on: !on, favouriteRow: favouriteRowOf(client, food.id) });
      await client.cancelQueries({ queryKey: queryKeys.foods() });
      putFavourite(client, food, on);
    },
    onSuccess: (_data, { food, on }) => {
      confirmedOf(client).set(food.id, { on, favouriteRow: undefined });
    },
    onError: (_err, { food }) => {
      if (!isLast(food.id)) return;
      const confirmed = confirmedOf(client).get(food.id);
      if (!confirmed) return;
      putFavourite(client, food, confirmed.on, confirmed.favouriteRow);
      // The rows these lists hold may still show a state a later tap set.
      void client.invalidateQueries({ queryKey: queryKeys.foodSearches(), refetchType: "none" });
      void client.invalidateQueries({ queryKey: queryKeys.foodOwn(), refetchType: "none" });
    },
    onSettled: (_data, _err, { food }) => {
      if (!isLast(food.id)) return undefined;
      confirmedOf(client).delete(food.id);
      return afterFavourite(client, food.id);
    },
  });
  // A failure belongs to the food it was about: another food starts clean.
  const { reset } = mutation;
  useEffect(() => reset(), [foodId, reset]);
  return {
    toggle: (food, on) => mutation.mutate({ food, on }),
    error: mutation.error,
    pending: mutation.isPending ? mutation.variables.on : null,
  };
}
