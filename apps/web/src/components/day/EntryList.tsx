"use client";

import {
  btnText,
  dayEntriesActions,
  dayEntriesCopyButton,
  dayEntriesHead,
  dayEntriesHeadButton,
  dayEntriesHeading,
} from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/useEntryActions";
import type { Entry } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement } from "react";
import { EntryRow } from "./EntryRow";

// ---------------------------------------------------------------------------
// EntryList: the "Entries" row and the day's entries in the order they were
// added. "Mark all eaten" sits in the 44 px "Entries" row, so the row is the
// same height with and without it. The button shows on today and past days
// while anything is planned. A future day holds only planned entries, which
// cannot be marked, so it never shows there. From lg the row's heading lines
// up with the summary's first heading beside it (`dayEntriesHead`).
//
// "Copy" sits last in the same group, on any day with entries, future days
// included. It opens the copy sheet. Mark all eaten leaving the row moves
// nothing in it, since the group sits at the row's end.
//
// An empty day says "Nothing logged yet." today, "Nothing logged." before
// today and "Nothing planned yet." ahead. While the app does not know today
// the line keeps its room and says nothing, so the words come in place.
// ---------------------------------------------------------------------------

export interface EntryListProps {
  /** The entries, or null while the day loads: the list area stays empty. */
  entries: readonly Entry[] | null;
  /**
   * Where the day sits against today, or null while the app does not know today. A day before today
   * says nothing was logged, with no "yet". A day ahead holds only planned entries.
   */
  when: DayWhen | null;
  actions: EntryActions;
  onOpen: (entry: Entry, opener: HTMLElement) => void;
  /** Copy was pressed: open the copy sheet on this day's entries. */
  onCopy: (opener: HTMLElement) => void;
}

/** Where a day sits against today. */
export type DayWhen = "past" | "today" | "future";

export function EntryList({ entries, when, actions, onOpen, onCopy }: EntryListProps): ReactElement {
  const future = when === "future";
  const t = useTranslations("day.list");
  const listRef = useRef<HTMLUListElement>(null);
  const planned = entries?.filter((e) => e.status === "planned") ?? [];
  const canMarkAll = !future && planned.length > 0;
  const canCopy = entries !== null && entries.length > 0;

  // "Mark all eaten" pressed from the keyboard leaves once nothing is
  // planned: focus moves to the first row's main button.
  const focusFirstRow = useRef(false);
  useEffect(() => {
    if (!canMarkAll && focusFirstRow.current) {
      focusFirstRow.current = false;
      listRef.current?.querySelector<HTMLElement>('[data-row-action="open"]')?.focus();
    }
  }, [canMarkAll]);

  const markAllBusy = planned.some((e) => actions.busyIds.has(e.id));
  return (
    <section aria-labelledby="day-entries">
      <div className={dayEntriesHead} data-entries-head="">
        <h2 id="day-entries" className={dayEntriesHeading}>
          {t("title")}
        </h2>
        {/* Copy last in the group at the row's end, so it stays where it is when Mark all eaten leaves. */}
        <div data-entries-actions="" className={dayEntriesActions}>
          {canMarkAll && (
            <button
              type="button"
              aria-disabled={markAllBusy || actions.holding || undefined}
              onClick={(e) => {
                if (markAllBusy || actions.holding) return;
                focusFirstRow.current = e.detail === 0;
                void actions.markAll(planned);
              }}
              className={`${btnText} ${dayEntriesHeadButton}`}
            >
              {t("markAll")}
            </button>
          )}
          {canCopy && (
            <button
              type="button"
              data-copy-button=""
              aria-haspopup="dialog"
              aria-disabled={actions.holding || undefined}
              onClick={(e) => {
                if (!actions.holding) onCopy(e.currentTarget);
              }}
              className={`${btnText} ${dayEntriesCopyButton}`}
            >
              {t("copy")}
            </button>
          )}
        </div>
      </div>
      {entries !== null && entries.length === 0 && (
        <p data-entries-empty="" className="min-h-14 py-4 text-center text-base text-ink-muted">
          {when === "past" && t("emptyPast")}
          {when === "today" && t("emptyLogged")}
          {when === "future" && t("emptyPlanned")}
        </p>
      )}
      {entries !== null && entries.length > 0 && (
        <ul ref={listRef} className="border-t border-rule">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              future={future}
              busy={actions.busyIds.has(entry.id)}
              held={actions.holding}
              focusKey={actions.focusRequest?.id === entry.id ? actions.focusRequest.n : undefined}
              onFocusTaken={actions.focusDone}
              onMark={actions.markOne}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
