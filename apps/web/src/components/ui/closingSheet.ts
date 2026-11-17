import { useEffect, useRef, type CSSProperties, type SyntheticEvent } from "react";

// ---------------------------------------------------------------------------
// A closing sheet swallows presses. Base UI's Drawer gives its viewport and
// backdrop `pointer-events: none` the moment `open` turns false, so for the
// whole exit a press passes through the sliding sheet to the page under it:
// the second tap of a double tap on Save, Log or "+" landed on an entry row
// or the tab bar and opened what was there.
//
// So a sheet's backdrop, which covers the whole viewport, keeps catching
// presses from the moment the close starts until Base UI ends the exit and
// unmounts it. It catches and drops them: a press on it changes no focus and
// reaches nothing under it. It holds no focus and takes no Tab stop.
//
// - Its lifetime is Base UI's own: the backdrop leaves with the exit's end
//   (open-change-complete), and a reopen during the exit makes it the open
//   sheet's backdrop again, so nothing can be left behind.
// - A sheet that opens while another slides out mounts its own portal later
//   in the document, so it lies above the closing backdrop and takes presses
//   at once.
// - A stacked sheet's backdrop covers its parent. While the stacked sheet
//   slides out, presses on the parent are swallowed too, for the same reason
//   (its Save sits over the parent's rows).
//
// From `md` the dialog's exit is short, about 200 ms, and a mouse double
// click can be slower than that: its second click reached the page. So a
// sheet closed by a press inside it also swallows a press on the page within
// `CLOSING_PRESS_RADIUS_PX` of that press's point until `CLOSING_PRESS_MS`
// after it (`useClosingPresses`): the second press of a double click or a
// double tap lands where the first did. A press anywhere else lands, so a
// quick press on the parent sheet, or on a toast that opened since, is never
// lost. On a phone the exit already lasts about that long, and its backdrop
// swallows every press while it does. A reopen and an unmount end the swallow
// at once. A sheet closed with no press inside it, or with a key pressed
// inside it since (Escape, Enter in a field), swallows nothing more than its
// backdrop does, and a click from the keyboard is never swallowed.
// ---------------------------------------------------------------------------

/** How long after the press that closed a sheet a press near it is swallowed, however soon its exit ends. */
export const CLOSING_PRESS_MS = 500;

/** How near the press that closed a sheet a press must be to be swallowed: a double click's second click. */
export const CLOSING_PRESS_RADIUS_PX = 24;

// No `touchstart`: a window listener for it is passive, so it could not be
// dropped, and a tap acts on its `touchend`, which drops the mouse events and
// the click that follow it.
const PRESSES = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchend"] as const;

interface Point {
  x: number;
  y: number;
}

/** Where a press is on screen: a touch's changed touch, else the mouse or pointer's point. */
function pointOf(e: Event): Point | null {
  const touches = (e as TouchEvent).changedTouches;
  if (touches !== undefined) return touches.length > 0 ? { x: touches[0].clientX, y: touches[0].clientY } : null;
  const { clientX, clientY } = e as MouseEvent;
  return typeof clientX === "number" ? { x: clientX, y: clientY } : null;
}

/** The backdrop's style from Base UI's state: catching presses while it is closed and still on screen. */
export function closingBackdropStyle(state: { open: boolean }): CSSProperties {
  return state.open ? {} : { pointerEvents: "auto" };
}

/** A press on a closing backdrop moves no focus and does nothing else. On an open one, Base UI handles it. */
function dropWhileClosing(e: SyntheticEvent<HTMLElement>): void {
  if (!e.currentTarget.hasAttribute("data-closed")) return;
  e.preventDefault();
  e.stopPropagation();
}

/** The backdrop's handlers that drop a press while the sheet closes. */
export const closingBackdropHandlers = {
  onPointerDown: dropWhileClosing,
  onMouseDown: dropWhileClosing,
  onClick: dropWhileClosing,
  onTouchEnd: dropWhileClosing,
};

/**
 * Swallows a press near the last press inside the sheet until
 * `CLOSING_PRESS_MS` after it, once `open` turns false. Spread the handlers on the
 * sheet's popup: as React events they also hear a sheet stacked on it, which
 * is portaled elsewhere in the document, so a parent that closes with its
 * stacked sheet swallows too, even once the stacked one has unmounted. One
 * timer, cleared on a reopen and on unmount.
 */
export function useClosingPresses(open: boolean): {
  onPointerDownCapture: (e: { clientX: number; clientY: number }) => void;
  onKeyDownCapture: () => void;
} {
  const lastPress = useRef(Number.NEGATIVE_INFINITY);
  const lastPoint = useRef<Point>({ x: 0, y: 0 });
  useEffect(() => {
    if (open) return;
    const left = lastPress.current + CLOSING_PRESS_MS - performance.now();
    if (left <= 0) return;
    const at = lastPoint.current;
    const drop = (e: Event): void => {
      // A click from the keyboard (Enter or Space on a button) is never the second of a double click.
      if (e.type === "click" && (e as MouseEvent).detail === 0) return;
      const p = pointOf(e);
      if (p === null || Math.hypot(p.x - at.x, p.y - at.y) > CLOSING_PRESS_RADIUS_PX) return;
      e.preventDefault();
      e.stopPropagation();
    };
    for (const type of PRESSES) window.addEventListener(type, drop, true);
    const stop = (): void => {
      clearTimeout(timer);
      for (const type of PRESSES) window.removeEventListener(type, drop, true);
    };
    const timer = setTimeout(stop, left);
    return stop;
  }, [open]);
  return {
    onPointerDownCapture: (e) => {
      lastPress.current = performance.now();
      lastPoint.current = { x: e.clientX, y: e.clientY };
    },
    // A key pressed since means the close did not come from that press.
    onKeyDownCapture: () => {
      lastPress.current = Number.NEGATIVE_INFINITY;
    },
  };
}
