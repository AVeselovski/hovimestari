"use client";

import { MacroFigures } from "@/components/figures/MacroFigures";
import type { Figures } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// AmountFigures: the figures for an amount as it is typed, under the field
// that takes it. "For this amount" over the four figures in one row, or
// "Enter an amount to see its figures." while nothing is typed. The caption
// keeps its line and the figures their slots while empty, so a figure
// filling in moves nothing. The log block, the ingredient picker and the
// recipe's log sheet each show it under their amount.
// ---------------------------------------------------------------------------

export function AmountFigures({
  preview,
  empty,
}: {
  /** The figures for what is typed, or null for nothing that parses. */
  preview: Figures | null;
  /** Nothing is typed. */
  empty: boolean;
}): ReactElement {
  const tAmount = useTranslations("entries.amount");
  const caption = preview !== null ? tAmount("forAmount") : empty ? tAmount("enterAmount") : null;
  return (
    <div data-log-figures="">
      <p aria-live="polite" className="mb-1 min-h-5 text-sm text-ink-muted">
        {caption}
      </p>
      <MacroFigures figures={preview} energyWord="calories" layout="row" />
    </div>
  );
}
