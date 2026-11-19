"use client";

import type { ToastApi, ToastPress } from "@/components/ui/Toast";
import { copyEntries, removeEntries } from "@/lib/api/entries";
import { getErrorCode } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import type { Day } from "@hovimestari/types";
import type { Query, QueryClient } from "@tanstack/react-query";
import type { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { chunksOf, type CopyDone, type CopyRequest, type SentCopy, type UndoOptions } from "./entryActions";

// ---------------------------------------------------------------------------
// Copying entries, composed into `useEntryActions`: ticked entries of a day
// copied to another day, always as planned entries, after what that day
// holds.
//
// - The ids come from the copy sheet, one per ticked entry and date. A resend
//   after a timeout carries the same ids, so the server adds what did not
//   land and answers the rest as replayed. A retry never doubles a copy.
// - A send goes in chunks of 100, each counted against the target date, and
//   each chunk's answered days go into the cache, so the target day shows its
//   copies with no read. `onLanded` tells the sheet as each chunk lands, so a
//   send that fails after one has landed counts as unsure.
// - Once the send succeeds, the ids the sheet sent earlier in this open and
//   not in this send (`stale`: a changed date or selection) are removed with
//   `POST /entries/remove`, before the toast. So an earlier send that landed
//   leaves nothing behind. When that cleanup fails, the copy still succeeded
//   and says so, and the days the stale ids went to are read again, so any
//   copy that landed there shows.
// - Undo removes every id this open sent, the stale ones included. Missing
//   ids are skipped by the server, so Undo is done when it answers. It does
//   not wait while the app asks for today.
// - A source entry removed on another device answers `entry_not_found`: the
//   day the entries are on is read again, so the sheet's list shows what is
//   left, and the error goes to the sheet's line.
// - The toast waits for `announce`, which the sheet calls once it has slid
//   out, so it never shows under the closing sheet.
// ---------------------------------------------------------------------------

type ToastT = ReturnType<typeof useTranslations<"toast">>;

/** What the copy borrows from `useEntryActions`. */
export interface CopyDeps {
  client: QueryClient;
  toast: ToastApi;
  t: ToastT;
  /** Throws `OfflineError` while known offline, false (send nothing) while holding. */
  ready: () => boolean;
  counted: <R>(dates: readonly (string | null | undefined)[], send: (zone: number) => Promise<R>) => Promise<R>;
  apply: (days: readonly Day[], zone: number) => Promise<void>;
  undo: (send: () => Promise<void>, options?: UndoOptions) => void;
  /** "tomorrow", or a short date, for the toast. */
  dayWord: (date: string) => string;
}

export interface CopyActions {
  copy: (request: CopyRequest) => Promise<CopyDone | "held">;
  readDaysAgain: (dates: readonly string[]) => void;
}

export function useCopyActions({ client, toast, t, ready, counted, apply, undo, dayWord }: CopyDeps): CopyActions {
  /**
   * Reads each date again, and each cached week that holds one of them, on
   * screen or not, so a copy that landed shows on its day at once, also on a
   * day or a week read ahead. A week that holds none of the dates is left
   * alone. Reads still out for them are cancelled first, so the read that
   * follows starts after whatever landed. A day or a week only a write put in
   * the cache has no read of its own and is only marked stale.
   */
  const readDaysAgain = useCallback(
    (dates: readonly string[]) => {
      const wanted = [...new Set(dates)];
      const keys = wanted.map((date) => queryKeys.day(date));
      const withRead = (query: Query) => typeof query.options.queryFn === "function";
      // A range key is ["days", "range", from, to].
      const holdsOne = (query: Query) => {
        const [, , from, to] = query.queryKey;
        return typeof from === "string" && typeof to === "string" && wanted.some((d) => from <= d && d <= to);
      };
      const ranges = { queryKey: queryKeys.dayRanges(), predicate: holdsOne };
      void (async () => {
        await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey, exact: true })));
        await client.cancelQueries(ranges);
        await Promise.all([
          ...keys.map((queryKey) => client.invalidateQueries({ queryKey, exact: true, refetchType: "none" })),
          client.invalidateQueries({ ...ranges, refetchType: "none" }),
        ]);
        await Promise.all([
          ...keys.map((queryKey) => client.refetchQueries({ queryKey, exact: true, predicate: withRead })),
          client.refetchQueries({ queryKey: queryKeys.dayRanges(), predicate: (q) => holdsOne(q) && withRead(q) }),
        ]);
      })().catch(() => {});
    },
    [client],
  );

  /** Removes the listed copies, 100 at a time, each request counted against the dates it may change. */
  const removeCopies = useCallback(
    async (copies: readonly SentCopy[]): Promise<void> => {
      for (const chunk of chunksOf(copies)) {
        await counted(
          chunk.map((c) => c.date),
          async (zone) => {
            const res = await removeEntries(chunk.map((c) => c.id));
            await apply(res.days, zone);
          },
        );
      }
    },
    [apply, counted],
  );

  const copy = useCallback(
    async ({ fromDate, toDate, entries, stale, sent, onLanded }: CopyRequest): Promise<CopyDone | "held"> => {
      if (!ready()) return "held";
      try {
        for (const chunk of chunksOf(entries)) {
          await counted([toDate], async (zone) => {
            const res = await copyEntries({ toDate, entries: chunk });
            await apply(res.days, zone);
          });
          onLanded?.();
        }
      } catch (err) {
        if (getErrorCode(err) === "entry_not_found") readDaysAgain([fromDate]);
        throw err;
      }
      if (stale.length > 0) {
        try {
          await removeCopies(stale);
        } catch {
          readDaysAgain(stale.map((c) => c.date));
        }
      }
      // Exactly the ids this open sent, whatever the sheet does after it closes.
      const undoes = sent.map((c) => ({ ...c }));
      const message = t("copied", { count: entries.length, day: dayWord(toDate) });
      const announce = (): void => {
        toast.show({
          message,
          action: {
            label: t("undo"),
            onPress: (press: ToastPress) => undo(() => removeCopies(undoes), { fromKeyboard: press.fromKeyboard }),
          },
        });
      };
      return { announce };
    },
    [apply, counted, dayWord, readDaysAgain, ready, removeCopies, t, toast, undo],
  );

  return useMemo(() => ({ copy, readDaysAgain }), [copy, readDaysAgain]);
}
