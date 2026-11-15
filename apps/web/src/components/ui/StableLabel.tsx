import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// StableLabel: a button label that switches between two texts without the
// button changing width. Both labels share one grid cell, so the cell is as
// wide as the longer one in both states and nothing beside the button moves.
// The hidden label is `invisible` (it keeps its space) and `aria-hidden`, so
// the button's accessible name is always the label on screen.
// ---------------------------------------------------------------------------

interface StableLabelProps {
  /** Show `busy` instead of `idle`. */
  active: boolean;
  /** The resting label. */
  idle: ReactNode;
  /** The label while `active`: "Saving…", "Copied" and the like. */
  busy: ReactNode;
  /** Classes for both labels, such as an icon-and-text row. */
  className?: string;
  /** Classes for the `busy` label only, such as the success colour. */
  busyClassName?: string;
}

export function StableLabel({
  active,
  idle,
  busy,
  className = "",
  busyClassName = "",
}: StableLabelProps): ReactElement {
  return (
    <span className="grid">
      <span className={`[grid-area:1/1] ${className} ${active ? "invisible" : ""}`} aria-hidden={active || undefined}>
        {idle}
      </span>
      <span
        className={`[grid-area:1/1] ${className} ${busyClassName} ${active ? "" : "invisible"}`}
        aria-hidden={!active || undefined}
      >
        {busy}
      </span>
    </span>
  );
}
