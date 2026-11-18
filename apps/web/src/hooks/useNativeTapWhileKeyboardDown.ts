import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// useNativeTapWhileKeyboardDown: while the software keyboard is down, a tap
// on a text field in the sheet is the browser's own. Lifted from finanssi,
// where the owner confirmed it on his iPhone.
//
// Base UI's `Drawer.VirtualKeyboardProvider` takes over every tap on a text
// field in a sheet. It cancels the tap's `touchend`, which also cancels the
// browser's own click and focus, and focuses the field from code inside the
// tap instead. iOS raises the keyboard for a focus from code inside a tap
// only until the reader hides the keyboard with the keyboard's own button.
// After that, only a real tap on a field brings it back. Every tap Base UI
// takes over then focuses a field with no keyboard, and the form looks dead.
//
// What has happened since the keyboard was hidden cannot be read reliably: a
// field focused from code (the search field's Clear does that) looks like a
// focus that landed, yet iOS raised nothing. So the rule is the keyboard
// itself. While it is down, a tap that starts on a text field, or on its
// label, is kept from Base UI and left to the browser, which focuses the
// field and raises the keyboard. While it is up, Base UI takes over as
// before: moving between fields with the keyboard up is what its takeover is
// for.
//
// The tap is kept from Base UI at `touchstart`, so none of Base UI's touch
// handling runs for that touch and its `touchend` finds nothing to take
// over. Stopping the `touchend` alone would also skip the end of Base UI's
// swipe tracking, which can start on the `touchstart`. A swipe that starts
// on a text field while the keyboard is down is therefore the browser's own
// scroll, never a drag of the sheet.
// ---------------------------------------------------------------------------

/**
 * How much shorter than the window the visual viewport must be to count as a
 * software keyboard rather than browser chrome. Base UI's own threshold.
 */
const KEYBOARD_THRESHOLD = 60;

/** Input types that raise a software keyboard: Base UI's own list. */
const KEYBOARD_INPUT_TYPES = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

function isKeyboardInput(el: Element): boolean {
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && KEYBOARD_INPUT_TYPES.has(el.type)))
    return !el.matches(":disabled");
  return false;
}

/** The text field a tap on `target` focuses: the field itself, or the control of its label. */
function keyboardInputFor(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  if (isKeyboardInput(target)) return target;
  const control = target.closest("label")?.control ?? null;
  return control && isKeyboardInput(control) ? control : null;
}

/**
 * Base UI's own reading of the keyboard. A pinch zoom reads as no keyboard,
 * and Base UI then leaves every tap alone too.
 */
function keyboardIsUp(): boolean {
  const vv = window.visualViewport;
  return vv !== null && vv.scale === 1 && window.innerHeight - vv.height > KEYBOARD_THRESHOLD;
}

/** A callback ref for the sheet's Popup. */
export type NativeTapWhileKeyboardDownRef = (el: HTMLElement | null) => void;

export function useNativeTapWhileKeyboardDown(enabled: boolean): NativeTapWhileKeyboardDownRef {
  const [popup, setPopup] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setPopup(el), []);

  useEffect(() => {
    if (!enabled || !popup || !window.visualViewport) return;
    const el = popup;
    // Bubble phase on the Popup: before React's listener at the root, where
    // Base UI's touch handlers run. Read at the tap, so nothing goes stale.
    const onTouchStart = (e: TouchEvent): void => {
      if (keyboardIsUp() || e.touches.length !== 1) return;
      const field = keyboardInputFor(e.target);
      if (field && el.contains(field)) e.stopPropagation();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => el.removeEventListener("touchstart", onTouchStart);
  }, [enabled, popup]);

  return ref;
}
