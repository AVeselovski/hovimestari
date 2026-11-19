"use client";

import { focusRing } from "@/components/ui/styles";
import type { SavedMeal } from "@hovimestari/types";
import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// SavedMealRow: one saved meal in a list, a button that opens its meal view.
// Built like a food row: at least 56 px tall, the name wrapping rather than
// running out of the row, the meal's source under it, one muted line of
// `meta`, and a `trailing` control beside the button inside the same `<li>`,
// such as the "+" that logs it again. `description` says what a press does,
// for assistive tech.
// ---------------------------------------------------------------------------

/** The attribute a meal row's button carries, so focus can find it again after the meal view closes. */
export const MEAL_ROW_ATTRIBUTE = "data-meal-row";

export interface SavedMealRowProps {
  meal: SavedMeal;
  onOpen: (meal: SavedMeal, opener: HTMLElement) => void;
  /** The muted line under the name, such as "Last 1 meal". */
  meta: string;
  /** The meta line is figures, set in the monospaced face as every figure line in a list is. */
  metaFigures?: boolean;
  trailing?: ReactNode;
  /** What a press does, such as "Opens it to edit.", read after the row's name. */
  description?: string;
}

export function SavedMealRow({
  meal,
  onOpen,
  meta,
  metaFigures = false,
  trailing,
  description,
}: SavedMealRowProps): ReactElement {
  return (
    <li className="flex items-center gap-2 border-b border-rule last:border-b-0">
      <button
        type="button"
        {...{ [MEAL_ROW_ATTRIBUTE]: meal.id }}
        aria-description={description}
        onClick={(e) => onOpen(meal, e.currentTarget)}
        className={`flex min-h-14 min-w-0 flex-1 flex-col items-start py-3 text-left hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
      >
        <span className="block text-base font-medium break-words text-ink">{meal.name}</span>
        {meal.source !== null && <span className="mt-0.5 block text-sm break-words text-ink-muted">{meal.source}</span>}
        <span
          className={`mt-1 block text-sm break-words text-ink-muted${metaFigures ? " font-mono tabular-nums" : ""}`}
        >
          {meta}
        </span>
      </button>
      {trailing}
    </li>
  );
}
