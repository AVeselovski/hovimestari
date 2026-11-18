import type { TargetChange, TargetsOverview } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

// ---------------------------------------------------------------------------
// Edits to the cached targets read, from what a write answered, so a screen
// that shows before the read lands already holds the saved change.
// ---------------------------------------------------------------------------

/**
 * Puts a saved change into the cached targets read: in the list at its place
 * by start date, in place of one with the same start, and in force when it
 * is the latest start on or before the read's date. The first run is behind
 * a user who has a change. The rule is the server's own, and the read that
 * follows replaces this edit with the server's answer.
 */
export function putSavedChange(client: QueryClient, saved: TargetChange): void {
  client.setQueryData<TargetsOverview>(queryKeys.targets(), (old) => {
    if (old === undefined) return old;
    const changes = [...old.changes.filter((c) => c.effectiveFrom !== saved.effectiveFrom), saved].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    const inForce = changes.filter((c) => c.effectiveFrom <= old.date).at(-1) ?? null;
    return { ...old, changes, inForce, firstRunDue: false };
  });
}
