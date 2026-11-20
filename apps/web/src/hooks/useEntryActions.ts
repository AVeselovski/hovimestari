"use client";

import { inverseOf } from "@/components/entries/entryForm";
import { useToast, type ToastPress } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useToday } from "@/hooks/useToday";
import { patchEntry, removeEntry, restoreEntry, setEntriesStatus } from "@/lib/api/entries";
import { getErrorCode, getErrorStatus } from "@/lib/errors";
import { afterEntryWrite, beginEntryWrite, zoneEpoch } from "@/lib/invalidation";
import { dayLabel, formatDayShort } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import type { Day, Entry, EntryPatchBody, EntryStatus } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  chunksOf,
  focusRow,
  OfflineError,
  unconfirmed,
  type EntryActions,
  type FocusRequest,
  type SheetOutcome,
  type UndoOptions,
} from "./entryActions";
import { useAddActions } from "./useAddActions";
import { useCopyActions } from "./useCopyActions";

// ---------------------------------------------------------------------------
// useEntryActions: every write the Day tab makes to an entry, and each one's
// undo. Each write checks for a known offline state (nothing is sent), sends,
// puts the days it answered in the cache (`afterEntryWrite`) and shows the
// toast with the exact inverse as Undo.
//
// - An add (the log sheet's "+", Log, an estimate, and Save and log) throws
//   on a failure, so the sheet shows it in its own status or refusal line.
//   It answers `announce` instead of showing its toast (`useAddActions`).
// - One-tap writes on the page (mark one, mark all) report a failure in the
//   toast: "Could not confirm…" with Try again, which resends the same
//   request (a status change sets a state, so a repeat is harmless).
// - A sheet's writes (save, remove) throw, so the sheet shows the failure in
//   its own refusal line with the typed values kept. An entry that is gone
//   answers "gone": the sheet closes and the toast says so.
// - Every write waits while `useToday().holding`: a one-tap write does
//   nothing, and a sheet's write answers "held" without sending. Undo does
//   not wait: it names explicit ids and dates, so a midnight changes nothing
//   it sends.
// - A failed Undo offers Try again only where the request may not have
//   landed (offline, a timeout, a server fault). A refusal (a 4xx, such as a
//   restore after its window) shows its own line with no action, and the
//   days are read again. With `goneIsDone`, a 404 counts as undone.
// - An Undo pressed from the keyboard puts focus on the affected row's main
//   button at once when the row is on screen, so focus never waits in the
//   closing toast. A row that is not on screen (a removal, or a save that
//   moved the entry) takes focus once the answer shows it (`focusRequest`).
//   A request is used once (`focusDone`), so a row that mounts again later
//   does not take focus back.
// - A mark's undo is counted against the date the mark was made on, not the
//   date shown when Undo is pressed.
// - Each write is tagged with the time zone it was sent in (`zoneEpoch`). An
//   answer that lands after a zone change does not go into the cache: its
//   days are read again in the new zone, so an old zone's later today never
//   moves the app's today forward.
// - Two writes out at once on one date read that day again once both have
//   settled (`beginEntryWrite`), so an older answer landing last never
//   stands.
// - A copy to another day and its Undo live in `useCopyActions`, composed
//   here as the adds are.
// ---------------------------------------------------------------------------

export { OfflineError } from "./entryActions";
export type {
  AddDone,
  AddRequest,
  CopyDone,
  CopyRequest,
  EntryActions,
  FocusRequest,
  SaveAndLogDone,
  SaveAndLogRequest,
  SheetOutcome,
  UndoOptions,
} from "./entryActions";

export function useEntryActions(shownDate: string | null): EntryActions {
  const client = useQueryClient();
  const toast = useToast();
  const t = useTranslations("toast");
  const errorCopy = useErrorCopy();
  const online = useOnlineStatus();
  const { status: authStatus } = useAuth();
  const { today, holding } = useToday();
  const offline = !online || authStatus === "offline";

  // Read inside callbacks that outlive a render, such as a toast's action.
  const live = useRef({ offline, holding, today, shownDate });
  live.current = { offline, holding, today, shownDate };

  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const setBusy = useCallback((ids: readonly string[], busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (busy) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  /** Puts a write's days in the cache, and starts the reads that follow without waiting for them. */
  const apply = useCallback(
    async (days: readonly Day[], sentInZone: number): Promise<void> => {
      await afterEntryWrite(client, days, live.current.shownDate ?? undefined, live.current.today, sentInZone);
    },
    [client],
  );

  /**
   * Runs a write counted against `dates`, so overlapping writes on one date
   * end in a read of it. `send` receives the zone the write was sent in, for `apply`.
   */
  const counted = useCallback(
    async <R>(dates: readonly (string | null | undefined)[], send: (zone: number) => Promise<R>): Promise<R> => {
      const zone = zoneEpoch(client);
      const end = beginEntryWrite(
        client,
        dates.filter((d): d is string => typeof d === "string"),
      );
      try {
        return await send(zone);
      } finally {
        end();
      }
    },
    [client],
  );

  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusCount = useRef(0);
  const focusDone = useCallback((n: number) => setFocusRequest((cur) => (cur?.n === n ? null : cur)), []);

  /** Sends a status for `ids` on `date`, chunk by chunk, putting each chunk's days in the cache. Answers the ids it changed. */
  const sendStatus = useCallback(
    async (ids: readonly string[], status: EntryStatus, date: string | null): Promise<string[]> => {
      const changed: string[] = [];
      for (const chunk of chunksOf(ids)) {
        await counted([date], async (zone) => {
          const res = await setEntriesStatus(chunk, status);
          changed.push(...res.changedIds);
          await apply(res.days, zone);
        });
      }
      return changed;
    },
    [apply, counted],
  );

  /**
   * Runs an undo. Try again is offered only where the request may not have
   * landed. A refusal says why and reads the days again, since the entry is
   * not as the undo expected.
   */
  const undo = useCallback(
    (send: () => Promise<void>, options: UndoOptions = {}) => {
      // Pressed from the keyboard with the row on screen: focus moves there now,
      // before the toast hides. Otherwise the row takes it once the answer shows it.
      const focusLater = options.fromKeyboard === true && options.focusId !== undefined && !focusRow(options.focusId);
      const run = async (): Promise<void> => {
        try {
          if (live.current.offline) throw new OfflineError();
          await send();
        } catch (err) {
          const gone = getErrorStatus(err) === 404;
          if (gone && options.goneIsDone) {
            void client.invalidateQueries({ queryKey: queryKeys.days() });
            return;
          }
          if (err instanceof OfflineError || unconfirmed(err)) {
            toast.show({ message: t("undoFailed"), action: { label: t("retry"), onPress: () => void run() } });
            return;
          }
          void client.invalidateQueries({ queryKey: queryKeys.days() });
          toast.show({ message: errorCopy.forError(err) });
          return;
        }
        if (focusLater && options.focusId) {
          focusCount.current += 1;
          setFocusRequest({ id: options.focusId, n: focusCount.current });
        }
      };
      void run();
    },
    [client, errorCopy, t, toast],
  );

  const undoStatus = useCallback(
    (ids: readonly string[], back: EntryStatus, date: string | null, press: ToastPress) =>
      undo(
        async () => {
          await sendStatus(ids, back, date);
        },
        { focusId: ids[0], fromKeyboard: press.fromKeyboard },
      ),
    [undo, sendStatus],
  );

  /** A one-tap write failed: say so in the toast, with Try again where the request may not have landed. */
  const oneTapFailed = useCallback(
    (err: unknown, retry: () => void) => {
      if (getErrorCode(err) === "entry_not_found") {
        const date = live.current.shownDate;
        if (date) void client.invalidateQueries({ queryKey: queryKeys.day(date) });
        toast.show({ message: errorCopy.forCode("entry_not_found") });
      } else if (unconfirmed(err)) {
        toast.show({ message: t("unconfirmed"), action: { label: t("retry"), onPress: retry } });
      } else {
        toast.show({ message: errorCopy.forError(err) });
      }
    },
    [client, errorCopy, t, toast],
  );

  const markIds = useCallback(
    async (ids: readonly string[], name: string | null, alreadyChanged: readonly string[]): Promise<boolean> => {
      if (live.current.holding) return false;
      if (live.current.offline) {
        toast.show({ message: t("offline") });
        return false;
      }
      setBusy(ids, true);
      // The marks' date, for their undo, whatever day is shown when Undo is pressed.
      const date = live.current.shownDate;
      const changed = [...alreadyChanged];
      let sent = 0;
      try {
        for (const chunk of chunksOf(ids)) {
          await counted([date], async (zone) => {
            const res = await setEntriesStatus(chunk, "eaten");
            changed.push(...res.changedIds);
            await apply(res.days, zone);
          });
          sent += chunk.length;
        }
      } catch (err) {
        // The failed chunk and every unsent one go again on Try again.
        const rest = ids.slice(sent);
        oneTapFailed(err, () => void markIds(rest, name, changed));
        return false;
      } finally {
        setBusy(ids, false);
      }
      if (changed.length === 0) return false;
      toast.show({
        message:
          name !== null && ids.length === 1 ? t("markedOne", { name }) : t("markedMany", { count: changed.length }),
        action: { label: t("undo"), onPress: (press) => undoStatus(changed, "planned", date, press) },
      });
      return true;
    },
    [apply, counted, oneTapFailed, setBusy, t, toast, undoStatus],
  );

  const markOne = useCallback((entry: Entry) => markIds([entry.id], entry.name, []), [markIds]);
  const markAll = useCallback(
    (entries: readonly Entry[]) =>
      markIds(
        entries.map((e) => e.id),
        entries.length === 1 ? entries[0].name : null,
        [],
      ),
    [markIds],
  );

  /** Before a sheet's write: refused while offline, false (send nothing) while holding. */
  const ready = useCallback((): boolean => {
    if (live.current.offline) throw new OfflineError();
    return !live.current.holding;
  }, []);

  /** A sheet's write met an entry that is gone: read the day again and say so. */
  const gone = useCallback((): SheetOutcome => {
    const date = live.current.shownDate;
    if (date) void client.invalidateQueries({ queryKey: queryKeys.day(date) });
    toast.show({ message: errorCopy.forCode("entry_not_found") });
    return "gone";
  }, [client, errorCopy, toast]);

  const dayWord = useCallback(
    (date: string): string => {
      const now = live.current.today;
      const word = now === null ? null : dayLabel(date, now);
      if (word === "today") return t("today");
      if (word === "yesterday") return t("yesterday");
      if (word === "tomorrow") return t("tomorrow");
      return formatDayShort(date, undefined, now ?? undefined);
    },
    [t],
  );

  const save = useCallback(
    async (before: Entry, patch: EntryPatchBody, onAnswered?: () => void): Promise<SheetOutcome> => {
      if (!ready()) return "held";
      let res;
      try {
        res = await counted([before.date, patch.date], async (zone) => {
          const answer = await patchEntry(before.id, patch);
          onAnswered?.();
          await apply(answer.days, zone);
          return answer;
        });
      } catch (err) {
        if (getErrorCode(err) === "entry_not_found") return gone();
        throw err;
      }
      const after = res.entry ?? before;
      const inverse = inverseOf(before, after);
      // The name the answer holds, so a renamed estimate's toast names it as it is now.
      const name = after.name;
      const message =
        after.date !== before.date
          ? t("moved", { name, day: dayWord(after.date) })
          : Object.keys(inverse).length === 1 && inverse.status !== undefined
            ? after.status === "eaten"
              ? t("markedOne", { name })
              : t("plannedOne", { name })
            : t("saved", { name });
      toast.show({
        message,
        action:
          Object.keys(inverse).length === 0
            ? undefined
            : {
                label: t("undo"),
                onPress: (press) =>
                  undo(
                    () =>
                      counted([before.date, after.date], async (zone) => {
                        const back = await patchEntry(before.id, inverse);
                        await apply(back.days, zone);
                      }),
                    { focusId: before.id, fromKeyboard: press.fromKeyboard },
                  ),
              },
      });
      return "done";
    },
    [apply, counted, dayWord, gone, ready, t, toast, undo],
  );

  const remove = useCallback(
    async (entry: Entry, onAnswered?: () => void): Promise<SheetOutcome> => {
      if (!ready()) return "held";
      try {
        await counted([entry.date], async (zone) => {
          const res = await removeEntry(entry.id);
          onAnswered?.();
          await apply(res.days, zone);
        });
      } catch (err) {
        if (getErrorCode(err) === "entry_not_found") return gone();
        throw err;
      }
      toast.show({
        message: t("removed", { name: entry.name }),
        action: {
          label: t("undo"),
          onPress: (press) =>
            undo(
              () =>
                counted([entry.date], async (zone) => {
                  const back = await restoreEntry(entry.id);
                  await apply(back.days, zone);
                }),
              { focusId: entry.id, fromKeyboard: press.fromKeyboard },
            ),
        },
      });
      return "done";
    },
    [apply, counted, gone, ready, t, toast, undo],
  );

  const { add, saveAndLog, withdrawAdd } = useAddActions({
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
  });

  const { copy, readDaysAgain } = useCopyActions({ client, toast, t, ready, counted, apply, undo, dayWord });

  return useMemo(
    () => ({
      holding,
      busyIds,
      focusRequest,
      focusDone,
      markOne,
      markAll,
      save,
      remove,
      add,
      saveAndLog,
      withdrawAdd,
      copy,
      readDaysAgain,
    }),
    [
      holding,
      busyIds,
      focusRequest,
      focusDone,
      markOne,
      markAll,
      save,
      remove,
      add,
      saveAndLog,
      withdrawAdd,
      copy,
      readDaysAgain,
    ],
  );
}
