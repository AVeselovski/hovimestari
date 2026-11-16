import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// ---------------------------------------------------------------------------
// useAnchoredPanel: holds a vertically centred panel where it opened.
//
// A `BottomSheet` at `md`+ is a panel centred in its viewport. Centred, any
// change in its height moves its top: an inline error of one line pushes
// everything above it up by half a line and everything below it down by the
// other half, so the field the reader just fixed and the Save button they
// just pressed both jump. So once the panel has opened centred, this pins
// it there:
//
// - Its top stays where the centring put it, so nothing above a change in
//   height ever moves.
// - It never gets shorter while it is open. Content that goes away leaves
//   spare room above the footer, so the footer's buttons do not move up
//   when an error is fixed and its line goes.
// - It grows at its bottom edge. Growth that would push that edge out of the
//   viewport moves the panel up just far enough to stay inside, never above
//   the viewport's own padding.
// - A resize of the viewport itself (the window) lets it go: it is centred
//   again at its natural height, and pinned again where it stands the next
//   time its height changes.
//
// The caller turns it on once the panel has finished opening, so content
// that lands during the entry is still centred, and off again before the
// next open, which forgets all of the above.
//
// The top is the panel's `offsetTop`, its layout position, which the open
// animation's transform does not change. The first measure equals where the
// centring put it, so switching from centred to pinned paints the same frame.
// ---------------------------------------------------------------------------

export interface AnchoredPanel {
  /** A callback ref for the panel. Its parent is the viewport it is centred in. */
  panelRef: (el: HTMLElement | null) => void;
  /** True once the panel is pinned: its viewport then aligns it to the top. */
  pinned: boolean;
  /** The panel's style: its top margin and its least height while pinned, empty otherwise. */
  style: CSSProperties;
}

interface Pin {
  /** The panel's top, from the viewport's padding edge, in px. */
  top: number;
  /** The tallest the panel has been since it was pinned, in px. */
  height: number;
  /** The viewport's top padding, which the margin leaves out. */
  padTop: number;
}

export function useAnchoredPanel(enabled: boolean): AnchoredPanel {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const pinRef = useRef<Pin | null>(null);

  const panelRef = useCallback((el: HTMLElement | null) => setPanel(el), []);

  useLayoutEffect(() => {
    if (!enabled || !panel) {
      pinRef.current = null;
      setPin(null);
      return;
    }
    const viewport = panel.parentElement;
    if (!viewport) return;

    function update(next: Pin | null) {
      const prev = pinRef.current;
      if (prev && next && prev.top === next.top && prev.height === next.height) return;
      pinRef.current = next;
      setPin(next);
    }

    function measure(viewportResized: boolean) {
      if (!panel || !viewport) return;
      const style = getComputedStyle(viewport);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      const height = panel.offsetHeight;
      const prev = pinRef.current;
      if (prev === null) {
        update({ top: panel.offsetTop, height, padTop });
        return;
      }
      if (viewportResized) {
        // Centred again at its natural height. The next change in the
        // panel's height pins it where the centring has put it by then.
        update(null);
        return;
      }
      const lowest = viewport.clientHeight - padBottom - height;
      const top = prev.top > lowest ? Math.max(padTop, lowest) : prev.top;
      update({ top, height: Math.max(prev.height, height), padTop });
    }

    const observer = new ResizeObserver((entries) => {
      measure(entries.some((entry) => entry.target === viewport) && pinRef.current !== null);
    });
    observer.observe(panel);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [enabled, panel]);

  return {
    panelRef,
    pinned: pin !== null,
    // An empty style, not none, so React takes both properties off again.
    style: pin ? { marginTop: Math.max(0, pin.top - pin.padTop), minHeight: pin.height } : {},
  };
}
