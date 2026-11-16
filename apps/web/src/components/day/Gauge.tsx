import type { ReactElement } from "react";
import { gaugeGeometry, planStyle, type GaugeRange } from "./gaugeGeometry";

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

export interface GaugeProps {
  macro: GaugeMacro;
  range: GaugeRange;
  eaten: number;
  withPlan: number;
}

const pct = (v: number) => `${v}%`;

export function Gauge({ macro, range, eaten, withPlan }: GaugeProps): ReactElement {
  const g = gaugeGeometry(range, eaten, withPlan);
  const hue = HUE[macro];
  // The protein floor's tick is a little heavier: it is the bound that matters.
  const lowerTick = macro === "protein" ? "w-[3px]" : "w-0.5";
  return (
    <div aria-hidden="true" data-gauge={macro} className="relative py-1">
      <div
        data-gauge-part="track"
        className={`relative h-3.5 overflow-hidden bg-gauge-track md:h-4 ${g.cap ? "rounded-l-pill" : "rounded-pill"}`}
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
            className={`absolute inset-y-0 right-0 w-[3px] ${g.cap === "eaten" ? `box-content border-l border-bg ${hue.fill}` : `border-y-[1.5px] border-r-[1.5px] ${hue.border} ${hue.tint}`}`}
          />
        )}
      </div>
      <div
        data-gauge-part="tick-lower"
        className={`absolute inset-y-0 box-content -translate-x-1/2 border-x border-bg bg-ink ${lowerTick}`}
        style={{ left: pct(g.ticks.lower) }}
      />
      <div
        data-gauge-part="tick-upper"
        className="absolute inset-y-0 box-content w-0.5 -translate-x-1/2 border-x border-bg bg-ink"
        style={{ left: pct(g.ticks.upper) }}
      />
    </div>
  );
}
