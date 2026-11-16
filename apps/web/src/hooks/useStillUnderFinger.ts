import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// useStillUnderFinger: no scroll by code while a finger is on the screen.
//
// With a phone's keyboard up, Base UI's `Drawer.VirtualKeyboardProvider`
// scrolls a sheet's body to keep the focused field in view. It does that
// smoothly, after every focus change and again on every change of the visual
// viewport, which keeps coming while the keyboard slides or changes height
// (a number pad and a text keyboard are not the same height). It stops its
// own pending passes when a finger goes down, but not a scroll already under
// way, and a viewport change during the touch starts a new one.
//
// A field that slides away under a finger loses the tap. Base UI places a tap
// on a text field where the finger lifts, so the tap lands on whatever moved
// in: a pill, a label, the gap between fields. Measured on the entry sheet's
// Amount and Payee fields, where it was most of the lost taps.
//
// So while a finger is down the body holds still: code cannot scroll it until
// the last finger lifts, and a scroll already in progress is held where it
// stood when the finger landed. The reader's own scrolling is native and is
// not affected: the hold lets go as soon as the finger moves.
// Once the finger lifts, Base UI brings the newly focused field into view as
// before.
// ---------------------------------------------------------------------------

/**
 * How far a finger may wander and still be a tap, in CSS pixels: below the
 * point where a browser starts a native scroll, so a hold never fights the
 * reader's own scrolling.
 */
const MOVE_SLOP = 4;

/** A callback ref for the scrolling body. */
export type StillUnderFingerRef = (el: HTMLElement | null) => void;

export function useStillUnderFinger(enabled: boolean): StillUnderFingerRef {
  const [body, setBody] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setBody(el), []);

  useEffect(() => {
    if (!enabled || !body) return;
    const el = body;
    let fingers = 0;
    // Where the body stands while a tap is held, or null once the finger
    // moves: then it is the reader scrolling, and their scroll is native.
    let held: { top: number; x: number; y: number } | null = null;
    // The prototype's own, taken before the element's is shadowed below.
    const scrollTo = Element.prototype.scrollTo as (this: Element, ...args: unknown[]) => void;

    // Base UI scrolls the body through `scrollTo`. An own property shadows
    // the prototype's for this element alone.
    el.scrollTo = function (this: HTMLElement, ...args: unknown[]) {
      if (fingers > 0) return;
      scrollTo.apply(this, args);
    } as typeof el.scrollTo;

    const onTouchStart = (e: TouchEvent) => {
      fingers = e.touches.length;
      const touch = e.touches[0];
      held = fingers === 1 && touch ? { top: el.scrollTop, x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!held || !touch) return;
      if (Math.abs(touch.clientX - held.x) > MOVE_SLOP || Math.abs(touch.clientY - held.y) > MOVE_SLOP) held = null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      fingers = e.touches.length;
      if (fingers === 0) held = null;
    };
    // A smooth scroll already under way when the finger landed does not stop
    // for a touch, so each step it takes is put back. Putting it back is an
    // instant scroll, which also ends it.
    const onScroll = () => {
      if (held && el.scrollTop !== held.top)
        scrollTo.call(el, { top: held.top, behavior: "instant" } satisfies ScrollToOptions);
    };
    const options = { capture: true, passive: true } as const;
    document.addEventListener("touchstart", onTouchStart, options);
    document.addEventListener("touchmove", onTouchMove, options);
    document.addEventListener("touchend", onTouchEnd, options);
    document.addEventListener("touchcancel", onTouchEnd, options);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      Reflect.deleteProperty(el, "scrollTo");
      document.removeEventListener("touchstart", onTouchStart, options);
      document.removeEventListener("touchmove", onTouchMove, options);
      document.removeEventListener("touchend", onTouchEnd, options);
      document.removeEventListener("touchcancel", onTouchEnd, options);
      el.removeEventListener("scroll", onScroll);
    };
  }, [enabled, body]);

  return ref;
}
