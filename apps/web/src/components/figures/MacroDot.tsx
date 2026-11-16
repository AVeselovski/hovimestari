import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// MacroDot: a 10 px dot in a macro's reserved hue, the mark beside a figure.
// The four macro hues are named here, in Gauge.tsx and in globals.css, and
// nowhere else (figures/__tests__/macroHues.test.ts). A figure itself stays
// in ink: the hue marks, it never colours the number.
// ---------------------------------------------------------------------------

export type Macro = "energy" | "protein" | "carbs" | "fat";

const DOT: Record<Macro, string> = {
  energy: "bg-energy",
  protein: "bg-protein",
  carbs: "bg-carbs",
  fat: "bg-fat",
};

export function MacroDot({ macro }: { macro: Macro }): ReactElement {
  return <span aria-hidden="true" data-macro-dot={macro} className={`size-2.5 shrink-0 rounded-pill ${DOT[macro]}`} />;
}
