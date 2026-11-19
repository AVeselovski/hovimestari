"use client";

import { Icon } from "@/components/Icon";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { btnSecondary } from "@/components/ui/styles";
import { useToday } from "@/hooks/useToday";
import { addDays, formatDay, formatWeekRange } from "@/lib/localDate";
import { dayRangeQuery, targetsQuery } from "@/lib/queryOptions";
import { stepWeek, WEEK_LENGTH, weekOf } from "@/lib/week";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { predictedNoTargets } from "./noTargets";
import { WeekTable } from "./WeekTable";

// ---------------------------------------------------------------------------
// WeekSheet: the Monday-to-Sunday week holding the day the Day tab shows, as
// a sheet the Week button opens. The title names the week. The footer steps a
// week back or on, and keeps focus on the button pressed. A row press picks
// that day: the caller closes the sheet and shows the day, and focus goes back
// to the Week button.
//
// The sheet's week is its own: stepping it leaves the Day tab's day alone.
// The weeks before and after are read ahead, so a step usually shows its
// figures at once.
//
// It holds still. Below `md` the sheet keeps the height it opened at, and
// from `md` its dialog grows downwards only (BottomSheet). The table keeps
// one frame in every state (WeekTable), a failure or offline lays its line
// over the rows, and the one line about targets sits under the table, so the
// title and the first row are in the same place in every week.
// ---------------------------------------------------------------------------

export interface WeekSheetProps {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  /** The day the Day tab shows. The sheet opens on its week. */
  shownDate: string;
  /** A row was pressed: show that day. */
  onPick: (date: string) => void;
}

export function WeekSheet({ open, onClose, returnFocusTo, shownDate, onPick }: WeekSheetProps): ReactElement {
  const t = useTranslations("day.week");
  const summary = useTranslations("day.summary");
  const client = useQueryClient();
  const { today } = useToday();
  // Mounted fresh on every open, so each open starts on the shown day's week.
  const [from, setFrom] = useState(() => weekOf(shownDate).from);
  // The shown day's row takes focus once, as the sheet opens. A step back
  // into its week leaves focus on the footer button pressed.
  const [focusShown, setFocusShown] = useState(true);
  const step = (n: number): void => {
    setFocusShown(false);
    setFrom((f) => stepWeek(f, n));
  };
  const to = addDays(from, WEEK_LENGTH - 1);
  const query = useQuery(dayRangeQuery(from, to));
  // The gate's targets answer, read from the cache: which days have no targets. Never fetches by itself.
  const { data: overview } = useQuery({ ...targetsQuery(), enabled: false });

  useEffect(() => {
    for (const n of [-1, 1]) {
      const other = stepWeek(from, n);
      void client.prefetchQuery(dayRangeQuery(other, addDays(other, WEEK_LENGTH - 1)));
    }
  }, [client, from]);

  // Today is known here: the Week button waits while the date is null, and
  // the date is today's own until it is known. The fallback only satisfies
  // the type, and would show a year only for a week outside `from`'s year.
  const title = formatWeekRange(from, to, today ?? from, t("to"));
  const days = query.data?.days ?? null;

  let notice: ReactNode = null;
  if (days === null) {
    if (query.isError) {
      notice = (
        <>
          <p role="status" className="text-base text-ink">
            {t("failed")}
          </p>
          <button type="button" onClick={() => void query.refetch()} className={btnSecondary}>
            {t("retry")}
          </button>
        </>
      );
    } else if (query.fetchStatus === "paused") {
      notice = (
        <p role="status" className="text-base text-ink">
          {t("offline")}
        </p>
      );
    }
  }

  // Once, under the table, in a week that holds a day before the first change. For a user with any
  // targets change its line keeps its room in every week, empty and hidden where it has nothing to
  // say, so the height the sheet holds always includes it.
  const before = predictedNoTargets(from, overview);
  const targetsLine = before?.kind === "from" ? summary("targetsFrom", { date: formatDay(before.date) }) : null;
  const keepsTargetsLine = (overview?.changes.length ?? 0) > 0;

  const footer = (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" aria-label={t("previous")} onClick={() => step(-1)} className={btnSecondary}>
        <Icon name="chevronLeft" className="size-5 shrink-0" />
        {t("previousShort")}
      </button>
      <button type="button" aria-label={t("next")} onClick={() => step(1)} className={btnSecondary}>
        {t("nextShort")}
        <Icon name="chevronRight" className="size-5 shrink-0" />
      </button>
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      titleClassName="whitespace-nowrap max-md:text-xl"
      panelClassName="md:max-w-lg"
      returnFocusTo={returnFocusTo}
      footer={footer}
    >
      <div data-week-frame="" aria-busy={days === null && notice === null ? true : undefined} className="relative">
        <WeekTable
          from={from}
          today={today}
          shownDate={shownDate}
          focusShown={focusShown}
          days={days}
          overview={overview}
          caption={title}
          onPick={onPick}
        />
        {notice && (
          <div
            data-week-notice=""
            // Over whole rows, Wednesday to Friday. Its top is the head's stated height (WeekTable: 6.25 + 5.5, 7.25 + 6.5 from md)
            // plus two rows (min-h-11, min-h-13 from md), and it is three rows tall.
            className="absolute inset-x-0 top-33.75 flex h-33 flex-col items-start justify-center gap-3 bg-surface md:top-39.75 md:h-39"
          >
            {notice}
          </div>
        )}
      </div>
      {keepsTargetsLine && (
        <p
          data-week-targets-line=""
          aria-hidden={targetsLine ? undefined : true}
          className={`mt-3 min-h-4 text-xs leading-4 text-ink-muted md:min-h-5 md:text-sm md:leading-5 ${targetsLine ? "" : "invisible"}`}
        >
          {targetsLine}
        </p>
      )}
    </BottomSheet>
  );
}
