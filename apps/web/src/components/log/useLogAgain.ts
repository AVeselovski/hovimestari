"use client";

import type { AddDone, AddRequest, EntryActions } from "@/hooks/useEntryActions";
import { useFailureLine } from "@/hooks/useFailureLine";
import { getErrorCode } from "@/lib/errors";
import { newId } from "@/lib/newId";
import { pendingIdFor, pendingKey, settlePending } from "@/lib/pendingIds";
import type { AddEntryBody, EntryStatus } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useLogAgain: the "+" of the log sheet, which adds a recent or favourite
// item again with its last amount in one press.
//
// - The id comes from `pendingIds` under the item's key (the date, the kind
//   and the food or meal), so a press again after a timeout resends the same
//   id and the server adds one entry.
// - One add at a time: while one runs, every "+" ignores a press.
// - Success, or a replay, hands the toast to `onLogged`, which closes the
//   sheet and shows it once the sheet has closed. The "+" stays busy while
//   the sheet slides out, and the closing sheet swallows a second tap.
// - A failure keeps the sheet open and says so on the header's status line,
//   for 6 seconds or until the next press or keystroke: "You are offline."
//   when nothing was sent, "Could not confirm. Try again." when the add may
//   have landed, else the refusal's copy. A food or meal that is gone goes to
//   `onGone`.
// - An add that may have landed keeps its id for six seconds, as long as its
//   line shows at most (the add path holds it, lib/pendingIds.ts), so
//   pressing "+" again sends the same id and a landed add answers as a
//   replay. An `entry_id_taken` lets the id go: it can never succeed.
// ---------------------------------------------------------------------------

/** An item "+" can add: what it is and the amount it adds. */
export interface LogAgainItem {
  kind: "food" | "saved_meal";
  /** The food's or the saved meal's id. */
  sourceId: string;
  name: string;
  /** How the amount reads: "200 g", "1 meal". */
  amount: string;
  /** The request for `id` on `date`, at `status`. */
  body: (id: string, date: string, status: EntryStatus) => AddEntryBody;
}

export interface LogAgain {
  /** The key of the item whose add runs, or null. */
  busyKey: string | null;
  /** The key an item's add is kept under. */
  keyOf: (item: LogAgainItem) => string;
  press: (item: LogAgainItem) => void;
}

export interface UseLogAgainOptions {
  /** The sheet's date. */
  date: string;
  /** Eaten on today and past days, planned on a future day, read at the press. */
  statusAt: () => EntryStatus;
  actions: Pick<EntryActions, "add" | "holding">;
  /** The add was answered: close the sheet, then `done.announce()`. */
  onLogged: (done: AddDone) => void;
  /** The food or meal is gone. */
  onGone: (kind: LogAgainItem["kind"], sourceId: string) => void;
  /** Puts a failure on the sheet's status line, the one the sheet's other messages share. */
  sayFailure: (text: string) => void;
}

export function useLogAgain({ date, statusAt, actions, onLogged, onGone, sayFailure }: UseLogAgainOptions): LogAgain {
  const failureLine = useFailureLine("status");
  const client = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = useRef(false);

  const keyOf = useCallback((item: LogAgainItem) => pendingKey(date, item.kind, item.sourceId), [date]);

  const press = useCallback(
    (item: LogAgainItem) => {
      if (busyRef.current || actions.holding) return;
      const key = keyOf(item);
      const status = statusAt();
      const requestFor = (id: string): AddRequest => ({
        body: item.body(id, date, status),
        name: item.name,
        amount: item.amount,
        again: () => requestFor(newId()),
      });
      const request = requestFor(pendingIdFor(client, key));
      busyRef.current = true;
      setBusyKey(key);
      void (async () => {
        try {
          const done = await actions.add(request);
          if (done !== "held") {
            // Busy while the sheet slides out, showing what was pressed.
            onLogged(done);
            return;
          }
        } catch (err) {
          const code = getErrorCode(err);
          if (code === "food_not_found" || code === "saved_meal_not_found") onGone(item.kind, item.sourceId);
          else {
            // An id another account holds can never succeed: the next press mints a new one.
            if (code === "entry_id_taken") settlePending(client, request.body.id);
            sayFailure(failureLine(err));
          }
        }
        busyRef.current = false;
        setBusyKey(null);
      })();
    },
    [actions, client, date, failureLine, keyOf, onGone, onLogged, sayFailure, statusAt],
  );

  return { busyKey, keyOf, press };
}
