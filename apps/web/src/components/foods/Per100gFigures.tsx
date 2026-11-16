"use client";

import { MacroFigures } from "@/components/figures/MacroFigures";
import type { Per100g } from "@hovimestari/types";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Per100gFigures: a food's four figures per 100 g, through MacroFigures, the
// one figure list (components/figures/). The figures are the API's, rounded
// for display only.
// ---------------------------------------------------------------------------

export function Per100gFigures({ figures }: { figures: Per100g }): ReactElement {
  return <MacroFigures figures={figures} />;
}
