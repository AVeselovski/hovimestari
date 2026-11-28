import { createEvent, fireEvent } from "@testing-library/react";

/**
 * A tap on `target` as a browser sends one: its pointerdown, its pointerup,
 * then its click, which the browser counts as one click (`detail` 1).
 * Returns the click, so a test can read `defaultPrevented`.
 *
 * A press guard tells a tap from Enter, Space or a screen reader's
 * activation by `detail`: those click with `detail` 0 and no pointerdown,
 * which is what a bare `fireEvent.click` sends. So a test that means a tap
 * on a guarded surface taps with this.
 */
export function tap(target: Element): Event {
  fireEvent.pointerDown(target);
  fireEvent.pointerUp(target);
  return tapClick(target);
}

/** The click that ends a tap, alone: for a press whose pointerdown the test sent earlier. */
export function tapClick(target: Element): Event {
  const click = createEvent.click(target, { detail: 1 });
  fireEvent(target, click);
  return click;
}
