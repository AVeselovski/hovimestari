// ---------------------------------------------------------------------------
// gaugeGeometry: every position a day's gauge draws, in per cent of the
// track's width, so nothing is measured and nothing depends on the viewport.
// Gauge.tsx only turns these numbers into styles.
//
// - The scale runs from 0 to S = 1.25 × the range's upper bound. It depends
//   on the targets alone, so the band and the ticks never move while entries
//   are added, marked or removed.
// - The band runs from the lower bound to the upper. A band narrower than
//   2 % of the track (equal bounds included) is drawn 2 % wide from its lower
//   bound, so the lower bound, the protein floor, is always exact and only
//   the upper edge is widened.
// - Eaten fills from 0. The plan segment runs from eaten to eaten plus
//   planned, at least `PLAN_MIN_PX` wide, laid against the track's end when
//   it would cross it, and starting at 0 with the rounded start when nothing
//   is eaten.
// - A reading past S clamps at the end, and an end-cap says so, in the style
//   of the reading that passes, so a planned excess never reads as eaten.
//
// The gauge states a position. It never colours a verdict: nothing here
// knows whether a value is below, within or above the range.
// ---------------------------------------------------------------------------

/** The narrowest band, in per cent of the track. 2 % of a 288 px track is 5.8 px: two ticks with their edges. */
export const MIN_BAND_PERCENT = 2;
/** The narrowest plan segment, so its tint shows between its two borders. */
export const PLAN_MIN_PX = 4;

export interface GaugeRange {
  lower: number;
  upper: number;
}

export interface GaugeGeometry {
  /** S: the value at the track's end. */
  scale: number;
  /** The target band, from `start` to `end`. */
  band: { start: number; end: number };
  /** The two ticks, at the band's two edges. The lower one is the protein floor. */
  ticks: { lower: number; upper: number };
  /** The eaten fill, from 0 to `end`. Null when nothing is eaten. */
  eaten: { end: number } | null;
  /**
   * The plan segment, from `start` to `end` before its minimum width. Null
   * when eaten equals eaten plus planned on the track. `roundedStart` is
   * true when it starts at 0, where the eaten fill would have had its round.
   */
  plan: { start: number; end: number; roundedStart: boolean } | null;
  /** The end-cap: "eaten" when eaten passes S, "plan" when only eaten plus planned does. */
  cap: "eaten" | "plan" | null;
}

/** The scale for a range: 1.25 × its upper bound, never below 1. */
export function scaleOf(range: GaugeRange): number {
  return Math.max(1.25 * range.upper, 1);
}

/** `value` on the track, in per cent, clamped to 0 to 100. */
export function percentOf(value: number, scale: number): number {
  return (Math.min(Math.max(value, 0), scale) / scale) * 100;
}

export function gaugeGeometry(range: GaugeRange, eaten: number, withPlan: number): GaugeGeometry {
  const scale = scaleOf(range);
  const p = (v: number) => percentOf(v, scale);

  const start = p(range.lower);
  const end = Math.min(Math.max(p(range.upper), start + MIN_BAND_PERCENT), 100);

  const eatenEnd = p(eaten);
  const planEnd = p(withPlan);

  return {
    scale,
    band: { start, end },
    ticks: { lower: start, upper: end },
    eaten: eaten > 0 ? { end: eatenEnd } : null,
    plan: planEnd > eatenEnd ? { start: eatenEnd, end: planEnd, roundedStart: eatenEnd === 0 } : null,
    cap: eaten > scale ? "eaten" : withPlan > scale ? "plan" : null,
  };
}

/**
 * The plan segment's `left` and `width` as CSS: at least `PLAN_MIN_PX` wide,
 * and laid against the track's end instead of crossing it.
 */
export function planStyle(plan: { start: number; end: number }): { left: string; width: string } {
  const width = `max(${PLAN_MIN_PX}px, ${plan.end - plan.start}%)`;
  return { left: `min(${plan.start}%, calc(100% - ${width}))`, width };
}
