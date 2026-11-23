"use client";

import type { ToastApi, ToastPress } from "@/components/ui/Toast";
import { createCook } from "@/lib/api/cooks";
import { addEntry, removeEntry } from "@/lib/api/entries";
import { saveAndLog as sendSaveAndLog } from "@/lib/api/savedMeals";
import { getErrorCode } from "@/lib/errors";
import { OfflineError, unconfirmed } from "@/lib/failure";
import { afterAddUnconfirmed, afterCookUnconfirmed } from "@/lib/invalidation";
import { UNCONFIRMED_HOLD_MS, holdPending, settlePending } from "@/lib/pendingIds";
import type { Day } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import type { useTranslations } from "next-intl";
import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type {
  AddDone,
  AddRequest,
  CookDone,
  CookRequest,
  SaveAndLogDone,
  SaveAndLogRequest,
  UndoOptions,
} from "./entryActions";

// ---------------------------------------------------------------------------
// The adds of `useEntryActions`: an entry (the log sheet's "+", Log and an
// estimate) and a new saved meal logged in the same request ("Save and log").
//
// - Each is counted against its date and puts its answered days in the cache,
//   as every entry write does, so the row and both totals show with no read.
// - Neither shows its toast: it answers `announce`, which the log sheet calls
//   once it has slid out, so the toast never shows under a closing sheet.
// - Undo removes the entry, and a 404 counts as undone. After Save and log
//   the action reads "Remove from day" or "Remove from plan", so it is plain
//   that the meal stays saved.
// - A replay never says "Logged": it says the item is already there, with
//   "Log another" (or "Plan another"), which adds it once more with a fresh
//   id from the page itself. A one-tap write there, so a failure shows in the
//   toast with Try again, which resends the same id.
// - An add that could not confirm (no answer, a timeout, a server fault) may
//   have landed. It holds its pending id first, so "+" again resends it, then
//   reads its day and the recent items again, so an entry that landed shows
//   on the Day tab with its totals (`mayHaveLanded`). A press made while known
//   offline sent nothing and reads nothing.
// - `withdrawAdd` takes back an add that may have landed, with no toast, so a
//   "Save and log" pressed again with other figures logs those, not the old
//   ones (components/log/mealSends.ts). It answers whether it removed one.
// - `logCook` logs a batch as made. It is counted against every day one of
//   its servings is on. The batch keeps its id across a resend, so a second
//   send after a lost answer writes nothing and answers `replayed`, which
//   the sheet compares with what it sent. One that could not confirm reads
//   its days again. Its toast has no Undo, and names the days when the
//   batch fed more than one.
// ---------------------------------------------------------------------------

type ToastT = ReturnType<typeof useTranslations<"toast">>;

/** What the adds borrow from `useEntryActions`. */
export interface AddDeps {
  client: QueryClient;
  toast: ToastApi;
  t: ToastT;
  live: RefObject<{ offline: boolean; holding: boolean; today: string | null }>;
  /** Throws `OfflineError` while known offline, false (send nothing) while holding. */
  ready: () => boolean;
  counted: <R>(dates: readonly (string | null | undefined)[], send: (zone: number) => Promise<R>) => Promise<R>;
  apply: (days: readonly Day[], zone: number) => Promise<void>;
  undo: (send: () => Promise<void>, options?: UndoOptions) => void;
  oneTapFailed: (err: unknown, retry: () => void) => void;
  /** A date as a toast names it: "today", "tomorrow", "Sat 21 Nov". */
  dayWord: (date: string) => string;
}

export interface AddActions {
  logCook: (request: CookRequest) => Promise<CookDone | "held">;
  add: (request: AddRequest) => Promise<AddDone | "held">;
  saveAndLog: (request: SaveAndLogRequest) => Promise<SaveAndLogDone | "held">;
  withdrawAdd: (id: string, date: string) => Promise<boolean>;
}

export function useAddActions({
  client,
  toast,
  t,
  live,
  ready,
  counted,
  apply,
  undo,
  oneTapFailed,
  dayWord,
}: AddDeps): AddActions {
  // "Log another" from a replay's toast. A ref, because an add's toast offers it and it sends an add.
  const addAgainRef = useRef<(request: AddRequest) => void>(() => {});

  /** Undo of an add: remove the entry. Gone already, removed on another device: what Undo asked for is true. */
  const undoAdd = useCallback(
    (id: string, date: string, press: ToastPress) =>
      undo(
        () =>
          counted([date], async (zone) => {
            const back = await removeEntry(id);
            await apply(back.days, zone);
          }),
        { goneIsDone: true, fromKeyboard: press.fromKeyboard },
      ),
    [apply, counted, undo],
  );

  /** The toast of a replay, which never says "Logged" for a write this request did not make. */
  const announceReplay = useCallback(
    (again: () => AddRequest, name: string, planned: boolean, gone: boolean) => {
      const another = () => addAgainRef.current(again());
      if (gone) {
        toast.show({ message: t("replayRemoved"), action: { label: t("logAnother"), onPress: another } });
        return;
      }
      toast.show({
        message: planned ? t("alreadyPlanned", { name }) : t("alreadyLogged", { name }),
        action: { label: planned ? t("planAnother") : t("logAnother"), onPress: another },
      });
    },
    [t, toast],
  );

  /** Runs an add's write. One that could not confirm holds its id, then reads its day again. */
  const sendAdd = useCallback(
    async <R>(id: string, date: string, meal: boolean, send: (zone: number) => Promise<R>): Promise<R> => {
      try {
        return await counted([date], send);
      } catch (err) {
        if (!(err instanceof OfflineError) && unconfirmed(err)) {
          holdPending(client, id, Date.now() + UNCONFIRMED_HOLD_MS);
          void afterAddUnconfirmed(client, date, meal);
        }
        throw err;
      }
    },
    [client, counted],
  );

  const add = useCallback(
    async (request: AddRequest): Promise<AddDone | "held"> => {
      if (!ready()) return "held";
      const { id, date, status } = request.body;
      const res = await sendAdd(id, date, false, async (zone) => {
        const answer = await addEntry(request.body);
        settlePending(client, id);
        await apply(answer.days, zone);
        return answer;
      });
      const planned = status === "planned";
      const name = res.entry?.name ?? request.name;
      const announce = (): void => {
        if (res.outcome === "replayed") return announceReplay(request.again, name, planned, res.entry === null);
        const day = request.namesDay ? dayWord(date) : null;
        const message = planned
          ? day !== null
            ? t("addedToPlanOn", { name, day })
            : t("addedToPlan", { name })
          : request.body.kind === "estimate"
            ? t("loggedEstimate", { name })
            : day !== null && date !== live.current.today
              ? t("loggedOn", { name, amount: request.amount, day })
              : t("logged", { name, amount: request.amount });
        toast.show({ message, action: { label: t("undo"), onPress: (press) => undoAdd(id, date, press) } });
      };
      return { outcome: res.outcome === "replayed" ? "replayed" : "created", announce };
    },
    [announceReplay, apply, client, dayWord, live, ready, sendAdd, t, toast, undoAdd],
  );

  const saveAndLog = useCallback(
    async (request: SaveAndLogRequest): Promise<SaveAndLogDone | "held"> => {
      if (!ready()) return "held";
      const { id, date, status } = request.body.entry;
      const res = await sendAdd(id, date, true, async (zone) => {
        const answer = await sendSaveAndLog(request.body);
        await apply(answer.days, zone);
        return answer;
      });
      const planned = status === "planned";
      const name = res.meal.name;
      const announce = (): void => {
        if (res.outcome === "replayed") return announceReplay(request.again, name, planned, res.entry === null);
        toast.show({
          message: planned ? t("savedAndPlanned", { name }) : t("savedAndLogged", { name }),
          action: {
            label: planned ? t("removeFromPlan") : t("removeFromDay"),
            onPress: (press) => undoAdd(id, date, press),
          },
        });
      };
      return { outcome: res.outcome, meal: res.meal, announce };
    },
    [announceReplay, apply, ready, sendAdd, t, toast, undoAdd],
  );

  const logCook = useCallback(
    async (request: CookRequest): Promise<CookDone | "held"> => {
      if (!ready()) return "held";
      let result;
      try {
        result = await counted(request.dates, async (zone) => {
          const answer = await createCook(request.body);
          await apply(answer.days, zone);
          return answer;
        });
      } catch (err) {
        if (!(err instanceof OfflineError) && unconfirmed(err)) void afterCookUnconfirmed(client, request.dates);
        throw err;
      }
      // The toast names the days when the batch fed more than one.
      const days = new Set(request.dates).size;
      const message =
        days > 1
          ? t("loggedAsMadeOnDays", { name: request.name, count: days })
          : t("loggedAsMade", { name: request.name });
      return { result, announce: () => toast.show({ message }) };
    },
    [apply, client, counted, ready, t, toast],
  );

  const withdrawAdd = useCallback(
    async (id: string, date: string): Promise<boolean> => {
      // Throws while known offline. A removal by id does not depend on today, so it does not wait.
      ready();
      return counted([date], async (zone) => {
        try {
          const back = await removeEntry(id);
          await apply(back.days, zone);
          return true;
        } catch (err) {
          if (getErrorCode(err) !== "entry_not_found") throw err;
          return false;
        }
      });
    },
    [apply, counted, ready],
  );

  // Set after each render, never during one: a toast's press reads the latest.
  useLayoutEffect(() => {
    addAgainRef.current = (request: AddRequest) => {
      const send = async (): Promise<void> => {
        if (live.current.holding) return;
        if (live.current.offline) {
          toast.show({ message: t("offline") });
          return;
        }
        try {
          const done = await add(request);
          if (done !== "held") done.announce();
        } catch (err) {
          oneTapFailed(err, () => void send());
        }
      };
      void send();
    };
  });

  return useMemo(() => ({ add, saveAndLog, withdrawAdd, logCook }), [add, saveAndLog, withdrawAdd, logCook]);
}
