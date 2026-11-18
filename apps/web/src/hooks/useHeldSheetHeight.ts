import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";

// ---------------------------------------------------------------------------
// useHeldSheetHeight: holds a phone's bottom sheet at the height it opened at.
//
// Below `md` a sheet hangs from the bottom edge and is as tall as its
// content, up to its maximum. Hanging from the bottom, any change in its
// height moves its top edge and everything above the change: a refusal line
// that appears in the footer, or under a field, would push the title and the
// field being typed in up the screen. So once the sheet has opened, this
// holds its height:
//
// - Content that grows makes the body scroll instead. What is below the
//   growth moves down inside the body, and nothing above it moves.
// - Content that goes away leaves room at the end of the body, so the footer
//   and its buttons stay where they are.
// - The footer's padding for the software keyboard (`--sheet-footer-pad`,
//   styles.ts) still adds to the height, so the footer rides above the
//   keyboard as it does without the hold, up to the sheet's maximum height.
// - A change in the window's width, such as turning the phone, lets it go
//   for the rest of this open: the sheet follows its content again. A
//   change in height alone keeps the hold: a keyboard that resizes the
//   layout viewport, or a browser toolbar that shows or hides, must not drop
//   it just as typing starts.
//
// The caller turns it on once the sheet has finished opening, so content that
// lands during the entry still sizes it, and off again before the next open.
// The height is measured once, then. Content that loads after that must keep
// its room from the first render, such as a line that keeps the room of its
// longest form: the sheet no longer grows for it, so it would make the body
// scroll for no reason.
// The centred dialog from `md` holds still through `useAnchoredPanel`.
// ---------------------------------------------------------------------------

export interface HeldSheetHeight {
  /** A callback ref for the sheet's popup. */
  panelRef: (el: HTMLElement | null) => void;
  /** True while the height is held: the popup then takes `sheetPopupHeld`. */
  held: boolean;
  /** The popup's style: `--sheet-held-height` while held, empty otherwise. */
  style: CSSProperties;
}

export function useHeldSheetHeight(enabled: boolean): HeldSheetHeight {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<string | null>(null);
  const panelRef = useCallback((el: HTMLElement | null) => setPanel(el), []);

  useLayoutEffect(() => {
    if (!enabled || !panel) {
      setHeight(null);
      return;
    }
    // The height less the footer's bottom padding, which `sheetPopupHeld`
    // adds back through `--sheet-footer-pad`, so a keyboard opening still
    // grows it. A sheet with no footer takes the pad back off.
    const footer = panel.querySelector<HTMLElement>("[data-sheet-footer]");
    const pad = footer ? parseFloat(getComputedStyle(footer).paddingBottom) || 0 : 0;
    setHeight(
      footer ? `${panel.offsetHeight - pad}px` : `calc(${panel.offsetHeight}px - var(--sheet-footer-pad, 0px))`,
    );
    const width = window.innerWidth;
    const release = (): void => {
      if (window.innerWidth !== width) setHeight(null);
    };
    window.addEventListener("resize", release);
    return () => window.removeEventListener("resize", release);
  }, [enabled, panel]);

  return {
    panelRef,
    held: height !== null,
    // An empty style, not none, so React takes the property off again.
    style: height === null ? {} : ({ "--sheet-held-height": height } as CSSProperties),
  };
}
