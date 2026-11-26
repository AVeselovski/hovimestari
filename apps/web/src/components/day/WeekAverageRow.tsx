"use client";

import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { AverageReading, DaysAverage } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { AverageGauge, GaugeFrame, type GaugeMacro } from "./Gauge";
import {
  EMPTY_CELL,
  FIGURE_CELL,
  FIGURE_TYPE,
  gapBefore,
  GAUGE_CELL,
  MACROS,
  positionKey,
  READINGS,
  RULE_GAP_CELL,
  type WeekKind,
  type Which,
} from "./weekCells";

// ---------------------------------------------------------------------------
// WeekAverageRow: the week's average day, an eighth row under Sunday in the
// table's `<tfoot>`. The same shape and heights as a day: figures over a mini
// gauge, in the same columns. The figures are bare, as a day's are, and each
// cell speaks its count and position. The gauge marks each average with a
// ring (Planned) and a dot (Eaten), because the two count different days.
//
// Its label is out of flow: absolute in a `relative` header cell, beside a
// zero-width spacer that holds the row's height. So no wording, font or
// fallback face adds to the day column's width, and no column moves.
//
// A rule stands between Sunday and the average, in a `<tbody>` of its own
// before the `<tfoot>`: a gap, the rule, a gap. The gaps are rows, so the
// average's two rows keep a day's heights.
//
// It is not a button: there is no day to pick.
// ---------------------------------------------------------------------------

export interface WeekAverageRowProps {
  /** The week's average day, or null while the week loads, fails or is offline. */
  average: DaysAverage | null;
  /** The week against today, for the spoken count. */
  kind: WeekKind;
  /** The cached targets say no day of the week has targets: the frame keeps its gauges' room empty. */
  predictedWithout: boolean;
}

/** A macro's figure of an average reading. */
function valueOf(reading: AverageReading, macro: GaugeMacro): number | null {
  if (reading.figures === null) return null;
  return macro === "energy" ? reading.figures.energyKcal : reading.figures.proteinG;
}

export function WeekAverageRow({ average, kind, predictedWithout }: WeekAverageRowProps): ReactElement {
  const t = useTranslations("day");
  const noEntries = average !== null && average.withPlan.dates.length === 0;

  const spokenCount = (reading: AverageReading, which: Which): string => {
    const count = reading.dates.length;
    if (count === 0) return t("week.average.spokenNone");
    return which === "eaten" && kind === "current"
      ? t("week.average.spokenBeforeToday", { count })
      : t("week.average.spokenDays", { count });
  };

  const figureCell = (macro: GaugeMacro, which: Which): ReactNode => {
    const reading = average?.[which] ?? null;
    const value = reading ? valueOf(reading, macro) : null;
    const position = reading ? (macro === "energy" ? reading.energy : reading.protein) : null;
    const word = positionKey(macro, position);
    return (
      <td
        key={`${macro}-${which}`}
        data-week-average-figure={`${macro}-${which}`}
        // Semibold, as the week's summary line. JetBrains Mono keeps one advance at every weight, so no column moves.
        className={`${FIGURE_CELL} ${FIGURE_TYPE} font-semibold ${gapBefore(which)}`}
      >
        {reading && value !== null && (
          <>
            {reading.includesEstimate && (
              <>
                <span aria-hidden="true">{t("summary.approx")}</span>
                <span className="sr-only">{t("summary.estimated")} </span>
              </>
            )}
            {macro === "energy" ? formatKcal(value) : formatMacroGrams(value)}
          </>
        )}
        {/* A spoken pause after the figure and after the count, so the count is never heard as days in the range. */}
        {reading && (
          <span className="sr-only">
            {value === null
              ? spokenCount(reading, which)
              : t("week.average.spokenPause", { part: spokenCount(reading, which) })}
          </span>
        )}
        {word && <span className="sr-only">{t("week.average.spokenPause", { part: t(`week.spoken.${word}`) })}</span>}
      </td>
    );
  };

  const gaugeCell = (macro: GaugeMacro): ReactNode => {
    let gauge: ReactNode = null;
    if (average) {
      const targets = average.eaten.targets ?? average.withPlan.targets;
      if (targets) {
        const range = macro === "energy" ? targets.energyKcal : targets.proteinG;
        const placed = (r: AverageReading) => (r.targets ? valueOf(r, macro) : null);
        gauge = (
          <AverageGauge macro={macro} range={range} eaten={placed(average.eaten)} withPlan={placed(average.withPlan)} />
        );
      }
    } else if (!predictedWithout) {
      // The counted days are unknown while the week loads: the frame never predicts a range.
      gauge = <GaugeFrame size="mini" />;
    }
    return (
      <td key={macro} colSpan={2} data-week-average-gauge={macro} className={GAUGE_CELL}>
        {gauge}
      </td>
    );
  };

  return (
    <>
      {/* The rule between Sunday and the average, with room on both sides of it. */}
      <tbody aria-hidden="true" data-week-average-rule="">
        <tr>
          <td colSpan={5} className={RULE_GAP_CELL} />
        </tr>
        <tr className="border-t border-rule">
          <td colSpan={5} className={RULE_GAP_CELL} />
        </tr>
      </tbody>
      <tfoot data-week-average="">
        <tr>
          <th scope="row" rowSpan={2} className="relative p-0 text-left align-middle font-normal">
            {/* The row's height, as a day's button gives it, with no width. */}
            <span aria-hidden="true" data-week-average-spacer="" className="block min-h-11 w-0 md:min-h-13" />
            <span
              data-week-average-label=""
              className="absolute inset-y-0 left-0 flex items-center text-xs font-semibold whitespace-nowrap text-ink md:text-sm"
            >
              {t("week.average.label")}
            </span>
          </th>
          {noEntries ? (
            <td colSpan={4} data-week-average-empty="" className={EMPTY_CELL}>
              {t("reading.noEntries")}
            </td>
          ) : (
            MACROS.flatMap((macro) => READINGS.map((which) => figureCell(macro, which)))
          )}
        </tr>
        <tr aria-hidden="true">{MACROS.map(gaugeCell)}</tr>
      </tfoot>
    </>
  );
}
