import type { RangePosition } from "@hovimestari/types";
import type { GaugeMacro } from "./Gauge";

// ---------------------------------------------------------------------------
// What the week table's day rows and its average row share: the column
// order, the gaps, the figure type and the words a position is spoken in. One
// place, so the average row's cells line up under the days' and speak alike.
// ---------------------------------------------------------------------------

export type Which = "eaten" | "withPlan";

export const MACROS: readonly GaugeMacro[] = ["energy", "protein"];
export const READINGS: readonly Which[] = ["eaten", "withPlan"];

/** The gap before a figure column: 12 px at the start of a macro's group, 8 px inside it. */
export function gapBefore(which: Which): string {
  return which === "eaten" ? "pl-3" : "pl-2";
}

export const FIGURE_TYPE = "font-mono text-sm leading-5 text-ink tabular-nums md:text-base md:leading-6";

/** A figure cell's box: the same in a day row and the average row. */
export const FIGURE_CELL = "h-6.5 pt-1.5 text-right align-top whitespace-nowrap md:h-8 md:pt-2";

/** "No entries" across a row's four figure columns. */
export const EMPTY_CELL =
  "h-6.5 pt-1.5 pl-3 align-top text-sm leading-5 whitespace-nowrap text-ink-muted md:h-8 md:pt-2 md:text-base md:leading-6";

/** A gauge cell across a macro's two columns. */
export const GAUGE_CELL = "h-4.5 pt-0.5 pl-3 align-top md:h-5";

/** The catalog key under `day.week.spoken` for a position, or null for none. Protein's lower bound is its floor. */
export function positionKey(
  macro: GaugeMacro,
  position: RangePosition | null,
): "within" | "above" | "below" | "floor" | null {
  if (position === null) return null;
  if (position.position === "within") return "within";
  if (position.position === "above") return "above";
  return macro === "protein" ? "floor" : "below";
}

/** Where a week falls against today: it holds today, it is over, or it is still to come. */
export type WeekKind = "current" | "past" | "future";

/**
 * The week's kind from the app's today and the week's own dates, never from
 * its days' answers. An unknown today reads as past: the sheet opens only
 * once today is known, so this only satisfies the type, and "past" is the
 * form that claims nothing about today.
 */
export function weekKind(from: string, to: string, today: string | null): WeekKind {
  if (today === null || to < today) return "past";
  if (from > today) return "future";
  return "current";
}
