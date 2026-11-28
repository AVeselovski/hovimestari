import { createEvent, fireEvent, waitFor } from "@testing-library/react";

/**
 * The backdrop behind an open `BottomSheet` or the open nav drawer. Queried by its own marker
 * because Base UI marks every element outside an open sheet `aria-hidden`,
 * so `[aria-hidden="true"]` no longer finds the backdrop alone.
 */
export function getSheetBackdrop(): HTMLElement {
  const backdrop = document.querySelector<HTMLElement>("[data-sheet-backdrop]");
  if (!backdrop) throw new Error("No open sheet backdrop in the document");
  return backdrop;
}

/**
 * A press outside an open sheet: the full pointer sequence a tap produces.
 * Base UI closes on the click only when the press also started outside, so a
 * bare `click` does nothing.
 *
 * Not `userEvent.click`: when focus is inside the sheet, user-event blurs it
 * with the document as the focusout's `relatedTarget`, where a browser reports
 * `null`, and Base UI's focus manager throws on it. Nothing else differs.
 */
export function pressOutsideSheet(target: Element = getSheetBackdrop()): void {
  fireEvent.pointerDown(target);
  fireEvent.mouseDown(target);
  fireEvent.pointerUp(target);
  fireEvent.mouseUp(target);
  fireEvent.click(target);
}

/**
 * Every Base UI animation, entries and exits of sheets and popovers alike,
 * never finishes, so a test can look at a sheet while it slides out: it stays
 * in the DOM with `open` false, as in a browser for the 400ms of the exit. A
 * sheet opened meanwhile never reports its entry complete (`onOpened` does
 * not fire). Call in `beforeEach`; returns the `afterEach`.
 *
 * The test setup disables Base UI's animation wait, and jsdom has no
 * `getAnimations`; this turns the wait back on and hands it one animation
 * that never ends.
 */
export function holdSheetExits(): () => void {
  const flags = globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean };
  const hadOwn = Object.prototype.hasOwnProperty.call(Element.prototype, "getAnimations");
  const original = Element.prototype.getAnimations;
  flags.BASE_UI_ANIMATIONS_DISABLED = false;
  Element.prototype.getAnimations = function getAnimationsStub() {
    return [{ finished: new Promise(() => {}) } as unknown as Animation];
  };
  return () => {
    flags.BASE_UI_ANIMATIONS_DISABLED = true;
    if (hadOwn) Element.prototype.getAnimations = original;
    else delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  };
}

/**
 * A finger drag down from the handle of the sheet `dialog`, through Base UI's
 * own gesture code: three quarters of the sheet's height, slowly, so it
 * dismisses with reason `swipe` on distance alone, unless the sheet refuses.
 */
export function swipeSheetDown(dialog: HTMLElement): void {
  const handle = dialog.querySelector<HTMLElement>("[data-sheet-handle]");
  if (!handle) throw new Error("No sheet handle inside this dialog");
  swipe(dialog, handle, "down", 0.75, "drag");
}

/**
 * How fast a test swipe moves. Base UI closes a released swipe when its
 * average speed is at least 0.5 px/ms, whatever the distance, and otherwise
 * when it is past half the popup's size.
 *
 * - `"drag"`: 50px every 200ms (0.25 px/ms), so only the distance decides.
 * - `"flick"`: 50px every 5ms, well past the speed, so it closes at any
 *   distance Base UI counts as a swipe at all.
 */
export type SwipePace = "drag" | "flick";

/**
 * A finger swipe left across the nav drawer `dialog`, through Base UI's own
 * gesture code: `share` of the drawer's width at `pace` (a flick by default).
 * `from` is the element under the finger, the drawer itself by default.
 */
export function swipeDrawerLeft(
  dialog: HTMLElement,
  { share = 0.75, pace = "flick", from = dialog }: { share?: number; pace?: SwipePace; from?: HTMLElement } = {},
): void {
  swipe(dialog, from, "left", share, pace);
}

/**
 * jsdom has no layout and no `elementFromPoint`, both of which Base UI
 * reads. For the length of the gesture the popup gets a size and `from` is
 * the element under the finger; both are put back afterwards.
 *
 * Base UI times the gesture by each event's `timeStamp`, which jsdom would
 * stamp all within a millisecond, so every event gets an explicit one. It
 * also takes the first `touchmove` as the drag's origin, in place and time,
 * the way a real finger's first move is a few pixels from where it landed.
 * So the finger first "moves" on the spot, and every step after it counts.
 */
function swipe(
  popup: HTMLElement,
  from: HTMLElement,
  direction: "down" | "left",
  share: number,
  pace: SwipePace,
): void {
  const size = 400;
  const stepMs = pace === "drag" ? 200 : 5;
  const sizeProp = direction === "down" ? "offsetHeight" : "offsetWidth";
  const doc = document as { elementFromPoint?: Document["elementFromPoint"] };
  const originalElementFromPoint = doc.elementFromPoint;
  doc.elementFromPoint = () => from;
  Object.defineProperty(popup, sizeProp, { value: size, configurable: true });

  // The finger starts at (size, size) and moves along the one axis.
  const point = (d: number) =>
    direction === "down" ? { clientX: 100, clientY: d } : { clientX: size - d, clientY: 100 };
  try {
    const finger = (d: number) => [{ ...point(d), identifier: 1, target: from }];
    const at = (d: number) => ({ touches: finger(d), targetTouches: finger(d), changedTouches: finger(d) });
    let step = 0;
    const fire = (create: (el: Element, init: object) => Event, init: object) => {
      const event = create(from, init);
      Object.defineProperty(event, "timeStamp", { value: 1000 + stepMs * step++ });
      fireEvent(from, event);
    };
    const end = size * share;
    fire(createEvent.touchStart, at(0));
    fire(createEvent.touchMove, at(0));
    for (let d = size / 8; d < end; d += size / 8) fire(createEvent.touchMove, at(d));
    fire(createEvent.touchMove, at(end));
    fire(createEvent.touchEnd, { touches: [], targetTouches: [], changedTouches: finger(end) });
  } finally {
    delete (popup as { offsetHeight?: number; offsetWidth?: number })[sizeProp];
    if (originalElementFromPoint) doc.elementFromPoint = originalElementFromPoint;
    else delete doc.elementFromPoint;
  }
}

/**
 * Every element that takes focus from now until `stop()`, in order. A test
 * that must prove a field was never focused, not merely that it lost focus
 * again, reads this rather than the final `document.activeElement`.
 */
export function trackFocus(): { focused: Element[]; stop: () => void } {
  const focused: Element[] = [];
  const onFocusIn = (e: FocusEvent) => focused.push(e.target as Element);
  document.addEventListener("focusin", onFocusIn, true);
  return { focused, stop: () => document.removeEventListener("focusin", onFocusIn, true) };
}

/**
 * Base UI animations that finish only when the test says so, to hold a sheet
 * mid-entry and then let it come to rest (Base UI then reports the open as
 * complete). `finish()` ends every animation running now; `restore()` puts
 * the test setup back.
 */
export function controlSheetAnimations(): { finish: () => void; restore: () => void } {
  const flags = globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean };
  const hadOwn = Object.prototype.hasOwnProperty.call(Element.prototype, "getAnimations");
  const original = Element.prototype.getAnimations;
  let resolve: () => void = () => {};
  let finished = new Promise<void>((r) => (resolve = r));
  flags.BASE_UI_ANIMATIONS_DISABLED = false;
  Element.prototype.getAnimations = function getAnimationsStub() {
    return [{ finished } as unknown as Animation];
  };
  return {
    finish: () => {
      resolve();
      finished = new Promise<void>((r) => (resolve = r));
    },
    restore: () => {
      flags.BASE_UI_ANIMATIONS_DISABLED = true;
      if (hadOwn) Element.prototype.getAnimations = original;
      else delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    },
  };
}

/**
 * The open sheet whose title is `title`, read from the DOM, or null. A role
 * query misses a sheet that is open under a stacked one, because Base UI
 * hides it from assistive tech, so "the sheet closed" checked with
 * `queryByRole` passes while the sheet is still on screen. This does not.
 */
export function openSheet(title: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-open]')].find((d) =>
      [...d.querySelectorAll("h2")].some((h) => h.textContent === title),
    ) ?? null
  );
}

/**
 * Waits until the open `ConfirmDialog`'s confirm button is armed: it takes a
 * press only once its sheet is at rest and a short delay has passed, so the
 * second tap of a double tap on the control that opened it cannot confirm.
 * A test presses it after this, as a reader would.
 */
export async function confirmArmed(): Promise<void> {
  await waitFor(() => {
    if (!document.querySelector("[data-armed]")) throw new Error("The confirm button is not armed yet");
  });
}

/**
 * Waits until the press guard in `root` lets presses through: on a phone, a
 * sheet's guarded content (`useArmedAtRest`'s `guardProps`) takes a press only
 * once the sheet is at rest and a short delay has passed. A test that taps it
 * right after opening is the second tap of a double tap, so a test that
 * means a later tap waits for this first, as a reader's tap would come.
 */
export async function guardArmed(root: () => Element): Promise<void> {
  await waitFor(
    () => {
      if (!root().querySelector('[data-press-guard="armed"]')) throw new Error("The press guard is not armed yet");
    },
    { timeout: 2000 },
  );
}

/**
 * Waits out the half second a view takes no press after a row's press
 * opened it (`usePressGuard`): a log sheet's food, meal or recipe view, or
 * the ingredient picker's amount. A test that presses in it right after
 * opening is the second tap of a double tap, so a test that means a later
 * press waits for this first, as a reader's press would come. Returns at once
 * when nothing in `root` holds.
 */
export async function viewHoldPassed(root: () => Element = () => document.body): Promise<void> {
  await waitFor(
    () => {
      if (root().querySelector('[data-press-guard="waiting"]')) throw new Error("The view still holds its presses");
    },
    { timeout: 2000 },
  );
}
