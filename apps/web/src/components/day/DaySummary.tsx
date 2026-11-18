"use client";

import { MacroDot } from "@/components/figures/MacroDot";
import { rangeFigure } from "@/components/figures/rangeParts";
import { dayHeadLine } from "@/components/ui/styles";
import { formatGrams, formatKcal } from "@/lib/foodFormat";
import { formatDay } from "@/lib/localDate";
import { formatTarget } from "@/lib/targetFormat";
import type { Day, DayReading, RangePosition } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { Gauge, type GaugeMacro } from "./Gauge";
import type { NoTargets } from "./noTargets";

// ---------------------------------------------------------------------------
// DaySummary: a day's two readings, Eaten and With plan, side by side: Eaten
// on the left, With plan on the right. No visible heads name the columns. A
// screen reader hears each figure's reading (`sr-only` terms), and the two
// columns never merge, also when they are equal. For calories and protein a
// gauge and, under it, each reading's figure and its distance from the
// range. Carbohydrates and fat as a two-row table in the same columns. Then
// two notes: whether a reading includes an estimate, and how many planned
// entries a past day never had marked eaten.
//
// It is sized for the first screen of a phone: the entries start under it,
// so every gap is what the type needs and no more.
//
// Nothing moves: every line that can change or appear keeps the room of its
// longest form, by laying that form invisibly in the same grid cell. So the
// summary is the same height loading, loaded, with or without an estimate,
// and whatever a figure's length. Both columns are always drawn, with equal
// figures when nothing is planned.
//
// It states positions and distances, never a verdict: the copy is a
// distance, the figures stay in ink, and the gauge colours nothing past a
// bound.
//
// A day without targets (`noTargets`, a day before the user's first change)
// is a second layout: each macro's label, then its two figures, with no
// gauge, no range and no distance. Where the gauges were, one row says from
// when the targets apply. The row is there on every such day and never on a
// day with targets, so within a day nothing moves. The frame takes the same
// layout when the caller predicts it, so the day does not open with tracks
// and then shrink.
// ---------------------------------------------------------------------------

type T = ReturnType<typeof useTranslations<"day.summary">>;

/**
 * The distance the line's room is kept for: four digits and a decimal, the
 * longest a person's own range gives (a range up to 9999.9 kcal). A
 * distance of five digits, 10000 kcal past a range, may take one more line.
 */
const LONGEST_DISTANCE = formatTarget(8888.8);

/** What a distance line shows, and what it reads aloud: the within form says "In the range" aloud only. */
interface DistanceCopy {
  shown: string;
  spoken: string;
}

function distanceCopy(t: T, macro: GaugeMacro, position: RangePosition["position"], distance: string): DistanceCopy {
  const same = (text: string): DistanceCopy => ({ shown: text, spoken: text });
  if (macro === "energy") {
    switch (position) {
      case "below":
        return same(t("energyBelow", { distance }));
      case "within":
        return { shown: t("energyWithin", { distance }), spoken: t("energyWithinSpoken", { distance }) };
      case "above":
        return same(t("energyAbove", { distance }));
    }
  }
  switch (position) {
    case "below":
      return same(t("proteinBelow", { distance }));
    case "within":
      return { shown: t("proteinWithin", { distance }), spoken: t("proteinWithinSpoken", { distance }) };
    case "above":
      return same(t("proteinAbove", { distance }));
  }
}

const POSITIONS = ["below", "within", "above"] as const;

/** Text that keeps the room of its longest forms whatever it holds: each form laid invisibly in the same cell. */
function Reserved({
  longest,
  children,
  className,
}: {
  longest: readonly string[];
  children: ReactNode;
  className: string;
}) {
  return (
    <span data-reserved="" className={`grid ${className}`}>
      {longest.map((form) => (
        <span key={form} aria-hidden="true" className="invisible [grid-area:1/1]">
          {form}
        </span>
      ))}
      <span className="[grid-area:1/1]">{children}</span>
    </span>
  );
}

/** A figure in the display size, with its unit, and "≈" when its reading includes an estimate. */
function BigFigure({ value, unit, estimate }: { value: string | null; unit: string; estimate: boolean }) {
  const t = useTranslations("day.summary");
  return (
    <span className="block min-h-7 font-mono text-2xl leading-7 text-ink tabular-nums md:min-h-9 md:text-[1.75rem] md:leading-9">
      {value !== null && (
        <>
          {estimate && (
            <>
              <span aria-hidden="true">{t("approx")}</span>
              <span className="sr-only">{t("estimated")} </span>
            </>
          )}
          {value}
          <span className="font-body text-sm text-ink-muted"> {unit}</span>
        </>
      )}
    </span>
  );
}

function readingOf(day: Day | null, which: "eaten" | "withPlan"): DayReading | null {
  return day === null ? null : day[which];
}

interface MacroBlockProps {
  macro: GaugeMacro;
  date: string;
  day: Day | null;
  /** A day without targets: the label and the two figures only. */
  figuresOnly: boolean;
}

function MacroBlock({ macro, date, day, figuresOnly }: MacroBlockProps): ReactElement {
  const t = useTranslations("day.summary");
  const labelId = `summary-${macro}`;
  const range = day?.targets ? (macro === "energy" ? day.targets.energyKcal : day.targets.proteinG) : null;
  const value = (r: DayReading) => (macro === "energy" ? r.figures.energyKcal : r.figures.proteinG);
  const format = macro === "energy" ? formatKcal : formatGrams;
  const unit = macro === "energy" ? t("kcal") : t("grams");
  // The same room in both columns: the longest of this macro's three forms.
  const longest = POSITIONS.map((p) => distanceCopy(t, macro, p, LONGEST_DISTANCE).shown);

  const cell = (which: "eaten" | "withPlan") => {
    const reading = readingOf(day, which);
    const position = reading ? (macro === "energy" ? reading.energy : reading.protein) : null;
    const copy = position ? distanceCopy(t, macro, position.position, formatTarget(position.distance)) : null;
    return (
      <div data-reading={which}>
        <dt className="sr-only">{which === "eaten" ? t("eaten") : t("withPlan")}</dt>
        <dd>
          <BigFigure
            value={reading ? format(value(reading)) : null}
            unit={unit}
            estimate={reading?.includesEstimate ?? false}
          />
          {!figuresOnly && (
            <Reserved longest={longest} className="mt-0.5 text-xs text-ink md:text-sm">
              <span data-distance="" aria-hidden="true">
                {copy?.shown}
              </span>
              {copy && <span className="sr-only">{copy.spoken}</span>}
            </Reserved>
          )}
        </dd>
      </div>
    );
  };

  return (
    <section aria-labelledby={labelId} data-summary-macro={macro}>
      <div className={`${dayHeadLine} justify-between gap-3`}>
        <h2 id={labelId} className="section-label">
          {macro === "energy" ? t("energy") : t("protein")}
        </h2>
        {/* The figures and the unit in the monospaced face, "to" in the body face, as in Settings.
            Kept while empty, for the line's height, and hidden from assistive technology then. */}
        <p className="text-xs text-ink md:text-sm" aria-hidden={range ? undefined : true}>
          {range &&
            t.rich(macro === "energy" ? "kcalRange" : "gramsRange", {
              lower: formatTarget(range.lower),
              upper: formatTarget(range.upper),
              num: rangeFigure,
            })}
        </p>
      </div>
      {!figuresOnly && (
        <div className="mt-1.5">
          {day && range ? (
            <Gauge key={date} macro={macro} range={range} eaten={value(day.eaten)} withPlan={value(day.withPlan)} />
          ) : (
            <GaugeFrame />
          )}
        </div>
      )}
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3">
        {cell("eaten")}
        {cell("withPlan")}
      </dl>
    </section>
  );
}

/** The gauge's track alone, with no band and no ticks, the same height as a gauge: the loading frame. */
function GaugeFrame(): ReactElement {
  return (
    <div aria-hidden="true" data-gauge="frame" className="py-1">
      <div className="h-3.5 rounded-pill bg-gauge-track md:h-4" />
    </div>
  );
}

/**
 * Where the gauges would be on a day without targets: the date the user's
 * first change starts, as a plain line with no control. While that date is
 * not known yet (`pending`), the line's room, empty and hidden from assistive
 * technology. One element in both, so the room never changes as the date
 * arrives.
 */
function TargetsRow({ noTargets }: { noTargets: NoTargets }): ReactElement {
  const t = useTranslations("day.summary");
  return (
    <p
      data-targets-row={noTargets.kind}
      aria-hidden={noTargets.kind === "from" ? undefined : true}
      className="mt-3 min-h-4 text-xs leading-4 text-ink-muted md:min-h-5 md:text-sm md:leading-5"
    >
      {noTargets.kind === "from" && t("targetsFrom", { date: formatDay(noTargets.date) })}
    </p>
  );
}

/**
 * Carbohydrates and fat: no target, so no gauge. A two-row table in the
 * summary's two columns. In the Eaten column the label holds a fixed-width
 * lead and the figure follows it, left-aligned. In the With plan column the
 * figure starts at the column's start, under the big figure above it.
 */
function SmallMacros({ day }: { day: Day | null }): ReactElement {
  const t = useTranslations("day.summary");
  const rows = [
    { macro: "carbs", label: t("carbs"), spoken: t("carbsSpoken"), value: (r: DayReading) => r.figures.carbsG },
    { macro: "fat", label: t("fat"), spoken: t("fat"), value: (r: DayReading) => r.figures.fatG },
  ] as const;
  return (
    <dl>
      {rows.map((row) => (
        <div key={row.macro} data-summary-macro={row.macro} className="grid grid-cols-2 gap-x-3">
          <dt className="col-start-1 row-start-1 flex min-h-5 w-16 items-center gap-2 text-sm text-ink-muted">
            <MacroDot macro={row.macro} />
            <span aria-hidden="true">{row.label}</span>
            <span className="sr-only">{row.spoken}</span>
          </dt>
          {(["eaten", "withPlan"] as const).map((which) => {
            const reading = readingOf(day, which);
            return (
              <dd
                key={which}
                data-reading={which}
                className={`row-start-1 min-h-5 justify-self-start font-mono text-base leading-5 text-ink tabular-nums ${which === "eaten" ? "col-start-1 ml-16" : "col-start-2"}`}
              >
                <span className="sr-only">{which === "eaten" ? t("eaten") : t("withPlan")} </span>
                {reading && (
                  <>
                    {reading.includesEstimate && (
                      <>
                        <span aria-hidden="true">{t("approx")}</span>
                        <span className="sr-only">{t("estimated")} </span>
                      </>
                    )}
                    {formatGrams(row.value(reading))}
                    <span className="font-body text-sm text-ink-muted"> {t("grams")}</span>
                  </>
                )}
              </dd>
            );
          })}
        </div>
      ))}
    </dl>
  );
}

export interface DaySummaryProps {
  /** The date shown, which keys the gauges: a new date paints without motion. */
  date: string;
  /** The day, or null for the frame: labels, empty tracks and empty figure slots of the same height. */
  day: Day | null;
  /** The date is before today, so the line for planned entries never marked eaten keeps its room. */
  past: boolean;
  /** A state line in the summary's frame while there is no day, such as "This day did not load." */
  notice?: ReactNode;
  /**
   * The day has no targets, loaded or predicted for the frame: figures only,
   * and the row that says why. Null for a day with targets.
   */
  noTargets?: NoTargets | null;
}

export function DaySummary({ date, day, past, notice, noTargets = null }: DaySummaryProps): ReactElement {
  const t = useTranslations("day.summary");
  const estimate = day?.eaten.includesEstimate
    ? t("estimateBoth")
    : day?.withPlan.includesEstimate
      ? t("estimateWithPlan")
      : null;
  const unmarked = day && day.unmarkedCount > 0 ? t("unmarked", { count: day.unmarkedCount }) : null;
  return (
    // Busy while it loads: the labels read with nothing after them until the day arrives.
    <div data-day-summary="" aria-busy={day === null && !notice ? true : undefined} className="relative">
      <div className={notice ? "invisible" : undefined} aria-hidden={notice ? true : undefined}>
        <MacroBlock macro="energy" date={date} day={day} figuresOnly={noTargets !== null} />
        <div className="mt-3">
          <MacroBlock macro="protein" date={date} day={day} figuresOnly={noTargets !== null} />
        </div>
        {noTargets && <TargetsRow noTargets={noTargets} />}
        <div className="mt-3">
          <SmallMacros day={day} />
        </div>
        <div className="mt-2 text-xs text-ink md:text-sm">
          <Reserved longest={[t("estimateBoth"), t("estimateWithPlan")]} className="">
            <span data-note="estimate">{estimate}</span>
          </Reserved>
          {past && (
            <Reserved longest={[t("unmarked", { count: 100 })]} className="">
              <span data-note="unmarked">{unmarked}</span>
            </Reserved>
          )}
        </div>
      </div>
      {notice && <div className="absolute inset-0 flex flex-col items-start justify-center gap-3">{notice}</div>}
    </div>
  );
}
