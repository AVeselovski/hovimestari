import type { ReactElement } from "react";
import { gaugeGeometry, MIN_BAND_PERCENT, MINI_MIN_BAND_PERCENT, planStyle, type GaugeRange } from "./gaugeGeometry";

// ---------------------------------------------------------------------------
// Gauge: where a day's calories or protein stand against the person's own
// range, as a position, never a verdict. Every number comes from
// `gaugeGeometry`. This file only draws it, in this order: the track, the
// band, the eaten fill, the plan segment, the end-cap, the two ticks.
//
// What it may colour: the eaten fill, the plan segment's tint and border, and
// the end-cap, in the macro's own hue. The track, the band and the ticks are
// neutral, and nothing changes colour past a bound. The hue utilities are
// named here and in MacroDot.tsx only.
//
// It is `aria-hidden`: the figures and distances beside it say everything it
// draws. The fills ease when the same day's figures change. The caller keys
// it by date, so a new date paints without motion.
// ---------------------------------------------------------------------------

export type GaugeMacro = "energy" | "protein";

const HUE: Record<GaugeMacro, { fill: string; border: string; tint: string }> = {
  energy: { fill: "bg-energy", border: "border-energy", tint: "bg-energy-plan" },
  protein: { fill: "bg-protein", border: "border-protein", tint: "bg-protein-plan" },
};

/**
 * `day`: the Day summary's gauge, on the page, a 14 px track (16 from `md`)
 * with ticks of 22. `mini`: a week row's, on the sheet's surface, a 6 px
 * track with ticks of 10, and a wider narrowest band, so the two ticks stay
 * apart on a short track.
 */
export type GaugeSize = "day" | "mini";

interface SizeParts {
  /** The room above and below the track, where the ticks reach. */
  frame: string;
  /** The track's height. */
  track: string;
  /** The track's colour: a step from what the gauge sits on. */
  trackColor: string;
  tick: string;
  floorTick: string;
  /** The 1 px edge that sets a tick and an eaten cap apart from a fill of the same hue, in the colour the gauge sits on. */
  edge: string;
  /** The narrowest band, in per cent of the track (gaugeGeometry). */
  minBandPercent: number;
}

/** Each size's parts. The gauge and its loading frame both read them, so the two are always the same height. */
const SIZE: Record<GaugeSize, SizeParts> = {
  day: {
    frame: "py-1",
    track: "h-3.5 md:h-4",
    trackColor: "bg-gauge-track",
    tick: "w-0.5",
    floorTick: "w-[3px]",
    edge: "border-bg",
    minBandPercent: MIN_BAND_PERCENT,
  },
  mini: {
    frame: "py-0.5",
    track: "h-1.5",
    trackColor: "bg-gauge-track-on-surface",
    tick: "w-px",
    floorTick: "w-0.5",
    edge: "border-surface",
    minBandPercent: MINI_MIN_BAND_PERCENT,
  },
};

/** A gauge's empty track, with no band and no ticks, the same height as the gauge: a day still loading. */
export function GaugeFrame({ size = "day" }: { size?: GaugeSize }): ReactElement {
  const sized = SIZE[size];
  return (
    <div aria-hidden="true" data-gauge="frame" data-gauge-size={size} className={sized.frame}>
      <div className={`rounded-pill ${sized.track} ${sized.trackColor}`} />
    </div>
  );
}

export interface GaugeProps {
  macro: GaugeMacro;
  range: GaugeRange;
  eaten: number;
  withPlan: number;
  /** Default `day`. */
  size?: GaugeSize;
}

const pct = (v: number) => `${v}%`;

export function Gauge({ macro, range, eaten, withPlan, size = "day" }: GaugeProps): ReactElement {
  const sized = SIZE[size];
  const g = gaugeGeometry(range, eaten, withPlan, { minBandPercent: sized.minBandPercent });
  const hue = HUE[macro];
  // The protein floor's tick is a little heavier: it is the bound that matters.
  const lowerTick = macro === "protein" ? sized.floorTick : sized.tick;
  return (
    <div aria-hidden="true" data-gauge={macro} data-gauge-size={size} className={`relative ${sized.frame}`}>
      <div
        data-gauge-part="track"
        className={`relative overflow-hidden ${sized.trackColor} ${sized.track} ${g.cap ? "rounded-l-pill" : "rounded-pill"}`}
      >
        <div
          data-gauge-part="band"
          className="absolute inset-y-0 bg-gauge-range"
          style={{ left: pct(g.band.start), width: pct(g.band.end - g.band.start) }}
        />
        {g.eaten && (
          <div
            data-gauge-part="eaten"
            className={`gauge-fill-motion absolute inset-y-0 left-0 rounded-l-pill ${hue.fill}`}
            style={{ width: pct(g.eaten.end) }}
          />
        )}
        {g.plan && (
          <div
            data-gauge-part="plan"
            className={`gauge-fill-motion absolute inset-y-0 border-[1.5px] ${hue.border} ${hue.tint} ${g.plan.roundedStart ? "rounded-l-pill" : ""}`}
            style={planStyle(g.plan)}
          />
        )}
        {g.cap && (
          <div
            data-gauge-part="cap"
            data-cap={g.cap}
            // An eaten cap meets an eaten fill of its own hue: a 1 px edge of the page colour on its inner side sets it apart, as on the ticks.
            className={`absolute inset-y-0 right-0 w-[3px] ${g.cap === "eaten" ? `box-content border-l ${sized.edge} ${hue.fill}` : `border-y-[1.5px] border-r-[1.5px] ${hue.border} ${hue.tint}`}`}
          />
        )}
      </div>
      <div
        data-gauge-part="tick-lower"
        className={`absolute inset-y-0 box-content -translate-x-1/2 border-x bg-ink ${sized.edge} ${lowerTick}`}
        style={{ left: pct(g.ticks.lower) }}
      />
      <div
        data-gauge-part="tick-upper"
        className={`absolute inset-y-0 box-content -translate-x-1/2 border-x bg-ink ${sized.edge} ${sized.tick}`}
        style={{ left: pct(g.ticks.upper) }}
      />
    </div>
  );
}
