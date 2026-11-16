"use client";

import { btnText } from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/useEntryActions";
import type { Entry } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement } from "react";
import { EntryRow } from "./EntryRow";

// ---------------------------------------------------------------------------
// EntryList: the "Entries" row and the day's entries in the order they were
// added. "Mark all eaten" sits in the 44 px "Entries" row, so the row is the
// same height with and without it. It shows on today and past days while
// anything is planned. A future day holds only planned entries, which cannot
// be marked, so it never shows there.
// ---------------------------------------------------------------------------

export interface EntryListProps {
  /** The entries, or null while the day loads: the list area stays empty. */
  entries: readonly Entry[] | null;
  future: boolean;
  actions: EntryActions;
  onOpen: (entry: Entry, opener: HTMLElement) => void;
}

export function EntryList({ entries, future, actions, onOpen }: EntryListProps): ReactElement {
  const t = useTranslations("day.list");
  const listRef = useRef<HTMLUListElement>(null);
  const planned = entries?.filter((e) => e.status === "planned") ?? [];
  const canMarkAll = !future && planned.length > 0;

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
      <div className="flex min-h-11 items-center justify-between gap-3" data-entries-head="">
        <h2 id="day-entries" className="section-label">
          {t("title")}
        </h2>
        {canMarkAll && (
          <button
            type="button"
            aria-disabled={markAllBusy || actions.holding || undefined}
            onClick={(e) => {
              if (markAllBusy || actions.holding) return;
              focusFirstRow.current = e.detail === 0;
              void actions.markAll(planned);
            }}
            className={btnText}
          >
            {t("markAll")}
          </button>
        )}
      </div>
      {entries !== null && entries.length === 0 && (
        <p className="py-4 text-base text-ink-muted">{future ? t("emptyPlanned") : t("emptyLogged")}</p>
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
