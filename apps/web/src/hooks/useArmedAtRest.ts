import { useEffect, useRef, useState } from "react";

/** Longer than the gap between the two taps of a double tap. */
export const ARM_DELAY_MS = 500;

export interface ArmedAtRest {
  /** True once presses count. */
  armed: boolean;
  /** Pass to `BottomSheet`'s `onOpened`. */
  onOpened: () => void;
  /** Props for the action button: `action` runs only on a press that started armed. */
  pressProps: (action: () => void) => {
    onPointerDown: () => void;
    onClick: () => void;
    "data-armed": "" | undefined;
  };
  /**
   * Props for a container, so every control in it waits the same way: a
   * click that does not count is stopped before it reaches the control.
   */
  guardProps: {
    onPointerDownCapture: () => void;
    onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => void;
    /** Only while the guard is on: "waiting", then "armed". */
    "data-press-guard": "waiting" | "armed" | undefined;
  };
}

/**
 * On a phone, keeps a sheet's action button from taking a press until the
 * sheet is at rest. There a sheet slides up under the finger that opened it, and the
 * control that opened it (the row sheet's Delete, a trash icon at the right
 * of a row, Mark the receipt filed…) can sit in the same bottom band as the
 * sheet's footer: the second tap of a double tap would land on the entering
 * action and run it.
 *
 * The button arms when the sheet reports it is at rest (`onOpened`) and no
 * sooner than `ARM_DELAY_MS` after it opened, and a press counts only if it
 * started on an armed button. All three are needed: a touch on an entering
 * sheet ends its entry at once (Base UI starts a swipe), so `onOpened` can
 * fire under the second tap itself; and with reduced motion the sheet is at
 * rest after a 150ms fade, inside a double tap. A click with no press before
 * it (Enter, Space) counts once armed. Disarmed again on every open.
 *
 * Callers pass `enabled` = `useIsMobile()`: at `md`+ a prompt is a popover
 * beside its trigger and a dialog fades in centred, neither under the finger,
 * so the button arms at once and a keyboard Enter is never swallowed.
 */
export function useArmedAtRest(open: boolean, enabled = true): ArmedAtRest {
  const [entered, setEntered] = useState(false);
  const [delayPassed, setDelayPassed] = useState(false);
  // State set during render, so a reopen is disarmed in the render that opens it.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setEntered(false);
      setDelayPassed(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setDelayPassed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const armed = !enabled || (entered && delayPassed);
  // Whether the press that ends in the next click started on an armed button.
  const pressStartedArmedRef = useRef<boolean | null>(null);

  return {
    armed,
    onOpened: () => setEntered(true),
    pressProps: (action) => ({
      onPointerDown: () => {
        pressStartedArmedRef.current = armed;
      },
      onClick: () => {
        const startedArmed = pressStartedArmedRef.current;
        pressStartedArmedRef.current = null;
        if (armed && startedArmed !== false) action();
      },
      "data-armed": armed ? "" : undefined,
    }),
    guardProps: {
      onPointerDownCapture: () => {
        pressStartedArmedRef.current = armed;
      },
      onClickCapture: (e) => {
        const startedArmed = pressStartedArmedRef.current;
        pressStartedArmedRef.current = null;
        if (armed && startedArmed !== false) return;
        e.preventDefault();
        e.stopPropagation();
      },
      "data-press-guard": !enabled ? undefined : armed ? "armed" : "waiting",
    },
  };
}
