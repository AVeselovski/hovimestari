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
import { weekTargetsLine } from "./noTargets";
import { weekKind } from "./weekCells";
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
// over the rows, and the lines under the table keep their room in every
// state, so the title and the first row are in the same place in every week.
//
// Under the table, two lines. The days each average counts, in words a person
// can check against the rows. And, for a person with any targets change, when
// targets start: the first change, or a later one starting mid-week.
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
  const average = query.data?.average ?? null;

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

  // The days each average counts. Always rendered, so the sheet's height includes it, and shown only
  // when Planned counts a day. Aria-hidden always: each average cell speaks its own count.
  const kind = weekKind(from, to, today);
  const eatenDays = average?.eaten.dates.length ?? 0;
  const plannedDays = average?.withPlan.dates.length ?? 0;
  let countedLine: string | null = null;
  if (plannedDays > 0) {
    if (kind === "current") countedLine = t("average.countedThisWeek", { eaten: eatenDays, planned: plannedDays });
    else if (kind === "past") countedLine = t("average.countedPast", { eaten: eatenDays, planned: plannedDays });
    else countedLine = t("average.countedFuture", { planned: plannedDays });
  }

  // When targets start in this week: the first change, or a later one after its Monday. For a user with
  // any targets change its line keeps its room in every week, empty and hidden where it has nothing to
  // say, so the height the sheet holds always includes it.
  const starts = weekTargetsLine(from, to, overview);
  const targetsLine =
    starts === null
      ? null
      : starts.kind === "first"
        ? summary("targetsFrom", { date: formatDay(starts.date) })
        : t("targetsNew", { date: formatDay(starts.date) });
  const keepsTargetsLine = (overview?.changes.length ?? 0) > 0;
  const lineClass = "mt-3 min-h-4 text-xs leading-4 text-ink-muted md:min-h-5 md:text-sm md:leading-5";

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
          to={to}
          kind={kind}
          today={today}
          shownDate={shownDate}
          focusShown={focusShown}
          days={days}
          average={average}
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
      <p data-week-counted-line="" aria-hidden="true" className={`${lineClass} ${countedLine ? "" : "invisible"}`}>
        {countedLine}
      </p>
      {keepsTargetsLine && (
        <p
          data-week-targets-line=""
          aria-hidden={targetsLine ? undefined : true}
          className={`${lineClass} ${targetsLine ? "" : "invisible"}`}
        >
          {targetsLine}
        </p>
      )}
    </BottomSheet>
  );
}
