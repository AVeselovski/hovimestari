import { useEffect, type RefObject } from "react";

// ---------------------------------------------------------------------------
// useTapAfterLoweredKeyboard: a tap on a field raises the keyboard again after
// the reader lowered it with the keyboard's own button.
//
// On an iPhone the keyboard's lower button hides the keyboard and leaves the
// field focused. Base UI's `Drawer.VirtualKeyboardProvider` takes over every
// tap on a text field in a keyboard-aware sheet: on `touchend` it cancels the
// browser's own handling of the tap and focuses the field itself, inside the
// tap, which is what lets iOS raise the keyboard. On the owner's iPhone,
// that focus raises no keyboard while another field, or the same
// one, still holds focus with the keyboard down: a tap does nothing and only
// a long press focuses (a long press ends in `touchcancel`, so the provider
// steps aside and the browser's own handling runs). On the same field the
// provider blurs it and focuses it again in one task. On another field it
// moves focus from one field to the next without the field ever losing it in
// between. WebKit's own reasons are not in any source here.
//
// The first tap in a freshly opened sheet always works, and in that state no
// field holds focus: the sheet does. So after a lowering, when a finger lands
// on a text field in the sheet, focus moves to the sheet itself (the popup),
// before the provider's `touchend`. The tap then ends in the same state as
// that first tap.
//
// A lowering is something this hook has seen: the keyboard went up while a
// field in the sheet held focus, then went down while a field still held it.
// Focus leaving the sheet's text fields forgets it, and so does the sheet
// closing. Without a lowering seen, the hook does nothing, and focus goes
// straight from field to field as the provider moves it. That keeps it out of
// the way where the keyboard reading below is wrong while a keyboard is up: a
// browser whose keyboard resizes the layout viewport, a floating iPad
// keyboard, a desktop touch keyboard. There the reading never says "up", so
// a blur between fields would drop a keyboard that is up.
//
// The keyboard is read the way the provider reads it: up when the visual
// viewport is 60px or more shorter than the window, down when it is less,
// and unknown with no visual viewport or at a pinch zoom other than 1.
// ---------------------------------------------------------------------------

/** The provider's threshold: a smaller change is the browser's own chrome moving. */
const KEYBOARD_RESIZE_THRESHOLD = 60;

/** The input types the provider treats as keyboard fields. */
const KEYBOARD_INPUT_TYPES = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

/** A field that raises a software keyboard and can take focus. */
export function isKeyboardField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (el instanceof HTMLInputElement) return KEYBOARD_INPUT_TYPES.has(el.type) && !el.disabled;
  return false;
}

/** The field a touch on `target` is for: the field itself, or the one its label names. */
function fieldOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (isKeyboardField(target)) return target;
  const control = target.closest("label")?.control ?? null;
  return isKeyboardField(control) ? control : null;
}

/** What the visual viewport says about a software keyboard. */
export function keyboardReading(): "up" | "down" | "unknown" {
  const vv = window.visualViewport;
  if (!vv || vv.scale !== 1) return "unknown";
  return window.innerHeight - vv.height > KEYBOARD_RESIZE_THRESHOLD ? "up" : "down";
}

/** True when `el` is a text field inside `popup`. */
function isFieldIn(popup: HTMLElement | null, el: Element | null): el is HTMLElement {
  return popup !== null && isKeyboardField(el) && popup.contains(el);
}

/**
 * While `enabled`, after a lowering of the keyboard this hook has seen, a
 * touch that lands on a text field inside `popupRef`'s element first moves
 * focus to that element.
 */
export function useTapAfterLoweredKeyboard(enabled: boolean, popupRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!enabled) return;
    // A keyboard went up while a field in the sheet held focus, and focus has
    // stayed in the sheet's fields since.
    let sawKeyboard = false;
    const watch = (): void => {
      if (keyboardReading() === "up" && isFieldIn(popupRef.current, document.activeElement)) sawKeyboard = true;
    };
    const onFocusOut = (e: FocusEvent): void => {
      if (!isFieldIn(popupRef.current, e.relatedTarget as Element | null)) sawKeyboard = false;
    };
    const onTouchStart = (e: TouchEvent): void => {
      const popup = popupRef.current;
      // A field in this sheet holds focus whenever the lowering is remembered.
      if (!sawKeyboard || !popup || e.touches.length !== 1) return;
      const field = fieldOf(e.target);
      if (!isFieldIn(popup, field)) return;
      if (keyboardReading() !== "down") return;
      // The sheet's own fields lost focus, so the lowering is forgotten here.
      popup.focus({ preventScroll: true });
    };
    const vv = window.visualViewport;
    const options = { capture: true, passive: true } as const;
    watch();
    vv?.addEventListener("resize", watch);
    document.addEventListener("focusin", watch, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("touchstart", onTouchStart, options);
    return () => {
      vv?.removeEventListener("resize", watch);
      document.removeEventListener("focusin", watch, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("touchstart", onTouchStart, options);
    };
  }, [enabled, popupRef]);
}
