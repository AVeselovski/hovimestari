import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// A range's figures in the monospaced face, inside a line set in the body
// face: "2200 to 2500 kcal" shows its two figures and the unit in mono and
// "to" in the body face. The catalog marks the figures with a `<num>` part,
// so the sentence stays one catalog entry. Settings' targets rows and the
// Day summary's range label share it, so the two read the same.
// ---------------------------------------------------------------------------

/** One `<num>` part of a range: the figures, and the unit after the upper one, in the monospaced face. */
export function rangeFigure(chunks: ReactNode): ReactElement {
  return <span className="font-mono tabular-nums">{chunks}</span>;
}
