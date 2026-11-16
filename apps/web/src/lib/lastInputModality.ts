/**
 * Which kind of input the reader last used.
 *
 * Focus restoration is a correctness requirement — when an overlay closes,
 * focus has to go back where it came from, or a screen reader and a keyboard
 * are both left at the top of the document. But a programmatic `focus()` can
 * still satisfy the browser's `:focus-visible` heuristic, so restoring focus
 * after a TAP paints a focus ring on the trigger, which is what the owner
 * kept seeing on his phone when he closed the date-range sheet.
 *
 * `:focus-visible` cannot be overridden from script, so the ring is
 * suppressed in CSS instead and this is what tells the CSS when to do it.
 * The listeners are registered once, when this module loads, passively, and
 * never removed: they cost one boolean assignment per interaction and the
 * answer is needed for the life of the page.
 */
let keyboard = false;
let listening = false;

function startListening(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("keydown", () => (keyboard = true), { capture: true, passive: true });
  document.addEventListener("pointerdown", () => (keyboard = false), { capture: true, passive: true });
}

// Start at once, so the first close on a page already knows a key was pressed.
// In development a Fast Refresh of this module registers a second pair of
// listeners. The old pair keeps writing the previous copy's flag, which
// nothing reads any more: harmless, and never in production.
startListening();

/** True when the last thing the reader touched was a key, not a pointer. */
export function lastInputWasKeyboard(): boolean {
  startListening(); // defensive: already started at module load in a browser
  return keyboard;
}

/**
 * Focus an element the way a restoration should: put focus back, but paint no
 * ring unless the reader is actually driving with a keyboard. The marker is
 * cleared the moment they touch a key or move focus on, so the element's
 * normal focus ring is never permanently disabled.
 */
export function restoreFocus(el: HTMLElement | null | undefined): void {
  if (!el?.focus) return;
  const suppressRing = !lastInputWasKeyboard();
  if (suppressRing) el.setAttribute("data-focus-restored", "");
  el.focus({ preventScroll: true });
  if (!suppressRing) return;
  // It did not take focus (hidden, say): no blur or keydown will ever clear
  // the marker, which would then swallow the ring when a keyboard gets there.
  if (document.activeElement !== el) {
    el.removeAttribute("data-focus-restored");
    return;
  }
  const clear = () => el.removeAttribute("data-focus-restored");
  el.addEventListener("blur", clear, { once: true });
  el.addEventListener("keydown", clear, { once: true });
}
