"use client";

import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// The body of a form sheet. On a phone it takes focus itself as the sheet
// opens, so no text field does: a field focused mid-slide raises the
// keyboard over a sheet still moving, and iOS then shoves the sheet off the
// top. The keyboard comes up when the reader taps a field. From `md` the
// sheet's first field autofocuses instead and the body stays out of the way.
// ---------------------------------------------------------------------------

export function PromptSheetBody({
  children,
  focusSelf = true,
}: {
  children: ReactNode;
  /** False from `md`, where the first field takes focus. Read when the body mounts. */
  focusSelf?: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Without scrolling: focusing the body would scroll the sheet's own
    // scroll container past its top padding.
    if (focusSelf) ref.current?.focus({ preventScroll: true });
    // Mount only: a sheet's body mounts once per open.
  }, []);
  return (
    <div ref={ref} tabIndex={-1} data-prompt-sheet-body="" className="focus:outline-none">
      {children}
    </div>
  );
}
