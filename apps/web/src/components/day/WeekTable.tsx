"use client";

import { focusRing } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { formatWeekRowDate } from "@/lib/localDate";
import { weekDates } from "@/lib/week";
import type { DayReading, DaysAverage, DaySummary, TargetsOverview } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { Gauge, GaugeFrame, type GaugeMacro } from "./Gauge";
import { predictedNoTargets } from "./noTargets";
import { WeekAverageRow } from "./WeekAverageRow";
import {
  EMPTY_CELL,
  FIGURE_CELL,
  FIGURE_TYPE,
  gapBefore,
  GAUGE_CELL,
  MACROS,
  positionKey,
  READINGS,
  type WeekKind,
  type Which,
} from "./weekCells";

// ---------------------------------------------------------------------------
// WeekTable: seven days side by side, Monday to Sunday, in a real table. Each
// day shows its two readings, Eaten and Planned, for calories and protein,
// and under each macro's two figures a mini gauge on days with targets. It
// states positions only: the figures stay in ink and nothing turns a colour
// past a bound. A screen reader hears each figure's position.
//
// Under Sunday, a `<tfoot>` holds the week's average day (WeekAverageRow).
//
// Each day is one `<tbody>` of two rows: the figures, then the gauges. Its
// date cell spans both and holds the day's button, named by the date alone,
// so table navigation reads the cells and the button repeats none of them.
// A press anywhere on the day picks it (the `<tbody>`'s click, which the
// button's own click also reaches), so the target is the whole row in every
// engine without positioning anything against a table row.
//
// Nothing moves. Every day is the same height in every state: loading, loaded,
// failed and offline, with or without entries, targets or an estimate. Each
// figure column keeps the room of its widest figure ("≈8888", "≈888.8") under
// its head, so a week's figures arriving move no column. The frame draws the
// day labels, the heads, empty figure cells and empty tracks, and leaves a
// gauge's room empty where the cached targets say the day has none.
// ---------------------------------------------------------------------------

/** The widest figure a column keeps room for: four digits with "≈". A five-digit figure still fits at 320. */
const LONGEST = { energy: 8888, protein: 888.8 } as const;

function figureOf(reading: DayReading, macro: GaugeMacro): string {
  return macro === "energy" ? formatKcal(reading.figures.energyKcal) : formatMacroGrams(reading.figures.proteinG);
}

export interface WeekTableProps {
  /** The week's Monday. */
  from: string;
  /** The week's Sunday. */
  to: string;
  /** The week against today: WeekSheet works it out once, for the counted line and the average's spoken count. */
  kind: WeekKind;
  /** The app's today, for the "Today" label. */
  today: string | null;
  /** The day the Day tab shows: its row is marked. */
  shownDate: string | null;
  /** The shown day's row takes focus as it mounts: true only for the week the sheet opened on. */
  focusShown: boolean;
  /** The week's days, or null for the frame. */
  days: readonly DaySummary[] | null;
  /** The week's average day, or null for the frame. */
  average: DaysAverage | null;
  /** The cached targets answer, which says which days have no targets before the week answers. */
  overview: TargetsOverview | undefined;
  /** The table's caption, for a screen reader: the week, as the title says it. */
  caption: string;
  onPick: (date: string) => void;
}

export function WeekTable({
  from,
  to,
  kind,
  today,
  shownDate,
  focusShown,
  days,
  average,
  overview,
  caption,
  onPick,
}: WeekTableProps): ReactElement {
  const t = useTranslations("day");
  const byDate = new Map(days?.map((d) => [d.date, d]) ?? []);
  const groupHead = (macro: GaugeMacro) => (
    <th
      key={macro}
      scope="colgroup"
      colSpan={2}
      className="h-6.25 pb-1 pl-3 text-center align-bottom font-semibold md:h-7.25"
    >
      <span className="block border-b border-rule pb-1">
        {macro === "energy" ? t("reading.energy") : t("week.protein")}
      </span>
    </th>
  );
  const readingHead = (macro: GaugeMacro, which: Which) => (
    <th
      key={`${macro}-${which}`}
      scope="col"
      className={`h-5.5 pb-1.5 text-right align-bottom font-semibold whitespace-nowrap md:h-6.5 ${gapBefore(which)}`}
    >
      {which === "eaten" ? t("reading.eaten") : t("reading.planned")}
      {/* The column's room: its widest figure, laid invisibly with no height. */}
      <span aria-hidden="true" data-figure-room="" className={`invisible block h-0 overflow-hidden ${FIGURE_TYPE}`}>
        {t("summary.approx")}
        {macro === "energy" ? formatKcal(LONGEST.energy) : formatMacroGrams(LONGEST.protein)}
      </span>
    </th>
  );

  return (
    <table data-week-table="" className="w-full border-collapse text-ink">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        {/* The day column has a fixed width, wider than "Today" at every size, so no week, state or user moves a column. The spare width goes to the four figure columns, so the gauges grow. */}
        <col data-week-day-col="" className="w-12 md:w-20" />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      {/* The head's two rows have stated heights, their content's own: 25 and 22 px on a phone, 29 and 26 from md. The failed notice in WeekSheet sits that far down, plus two rows. */}
      <thead className="text-xs leading-4 text-ink-muted md:text-sm md:leading-5">
        <tr>
          <td rowSpan={2} />
          {MACROS.map(groupHead)}
        </tr>
        <tr>{MACROS.flatMap((macro) => READINGS.map((which) => readingHead(macro, which)))}</tr>
      </thead>
      {weekDates(from).map((date) => (
        <WeekRow
          key={date}
          date={date}
          day={byDate.get(date) ?? null}
          isToday={date === today}
          shown={date === shownDate}
          autoFocus={focusShown && date === shownDate}
          predictedWithout={predictedNoTargets(date, overview) !== null}
          onPick={onPick}
        />
      ))}
      <WeekAverageRow
        // A new week paints its marks fresh.
        key={from}
        average={average}
        kind={kind}
        predictedWithout={predictedNoTargets(to, overview) !== null}
      />
    </table>
  );
}

interface WeekRowProps {
  date: string;
  day: DaySummary | null;
  isToday: boolean;
  shown: boolean;
  /** The row's button takes focus as it mounts. */
  autoFocus: boolean;
  /** The cached targets say this day has none: the frame keeps its gauges' room empty. */
  predictedWithout: boolean;
  onPick: (date: string) => void;
}

function WeekRow({ date, day, isToday, shown, autoFocus, predictedWithout, onPick }: WeekRowProps): ReactElement {
  const t = useTranslations("day");
  const label = formatWeekRowDate(date);
  const empty = day !== null && day.entryCount === 0;

  const positionWord = (macro: GaugeMacro, position: DayReading["energy"]): string | null => {
    const key = positionKey(macro, position);
    return key === null ? null : t(`week.spoken.${key}`);
  };

  const figureCell = (macro: GaugeMacro, which: Which): ReactNode => {
    const reading = day?.[which] ?? null;
    const position = reading ? (macro === "energy" ? reading.energy : reading.protein) : null;
    const spoken = positionWord(macro, position);
    return (
      <td
        key={`${macro}-${which}`}
        data-week-figure={`${macro}-${which}`}
        className={`${FIGURE_CELL} ${FIGURE_TYPE} ${gapBefore(which)}`}
      >
        {reading && (
          <>
            {reading.includesEstimate && (
              <>
                <span aria-hidden="true">{t("summary.approx")}</span>
                <span className="sr-only">{t("summary.estimated")} </span>
              </>
            )}
            {figureOf(reading, macro)}
            {spoken && <span className="sr-only"> {spoken}</span>}
          </>
        )}
      </td>
    );
  };

  const gaugeCell = (macro: GaugeMacro): ReactNode => {
    const range = day?.targets ? (macro === "energy" ? day.targets.energyKcal : day.targets.proteinG) : null;
    let gauge: ReactNode = null;
    if (day && range) {
      const value = (r: DayReading) => (macro === "energy" ? r.figures.energyKcal : r.figures.proteinG);
      gauge = <Gauge size="mini" macro={macro} range={range} eaten={value(day.eaten)} withPlan={value(day.withPlan)} />;
    } else if (day === null && !predictedWithout) {
      gauge = <GaugeFrame size="mini" />;
    }
    return (
      <td key={macro} colSpan={2} data-week-gauge={macro} className={GAUGE_CELL}>
        {gauge}
      </td>
    );
  };

  return (
    <tbody
      data-week-row={date}
      data-shown={shown ? "" : undefined}
      onClick={(e) => {
        // A pointer drag that selected text on this row is not a press. A keyboard press (detail 0) always
        // is, and a selection elsewhere on the page never blocks one.
        if (e.detail > 0 && selectionTouches(e.currentTarget)) return;
        onPick(date);
      }}
      className="cursor-pointer hover:bg-surface-raised active:bg-surface-raised"
    >
      <tr>
        <th scope="row" rowSpan={2} className="relative p-0 text-left align-middle font-normal">
          {/* The day the Day tab shows: a bar at the row's start, in the sheet's padding. */}
          {shown && (
            <span aria-hidden="true" data-shown-bar="" className="absolute inset-y-1 -left-2 w-[3px] bg-accent" />
          )}
          <button
            type="button"
            // Focus on open goes to the day shown. Base UI keeps a focus already inside the sheet.
            autoFocus={autoFocus}
            aria-current={shown ? "true" : undefined}
            aria-label={isToday ? t("week.spoken.today", { date: label.spoken }) : label.spoken}
            className={`flex min-h-11 flex-col justify-center rounded-sm text-left md:min-h-13 ${focusRing}`}
          >
            <span className="text-xs leading-4 whitespace-nowrap text-ink-muted md:text-sm md:leading-5">
              {isToday ? t("week.today") : label.weekday}
            </span>
            <span className="text-sm leading-5 font-semibold text-ink md:text-base md:leading-6">{label.day}</span>
          </button>
          {day !== null && day.unmarkedCount > 0 && (
            <span className="sr-only">{t("summary.unmarked", { count: day.unmarkedCount })}</span>
          )}
        </th>
        {empty ? (
          <td colSpan={4} data-week-empty="" className={EMPTY_CELL}>
            {t("reading.noEntries")}
          </td>
        ) : (
          MACROS.flatMap((macro) => READINGS.map((which) => figureCell(macro, which)))
        )}
      </tr>
      <tr aria-hidden="true">{MACROS.map(gaugeCell)}</tr>
    </tbody>
  );
}

/**
 * True when a text selection that is not collapsed touches `node`. The same
 * test as `Selection.containsNode(node, true)`, through `Range.intersectsNode`.
 */
function selectionTouches(node: Node): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  for (let i = 0; i < selection.rangeCount; i += 1) {
    if (selection.getRangeAt(i).intersectsNode(node)) return true;
  }
  return false;
}
