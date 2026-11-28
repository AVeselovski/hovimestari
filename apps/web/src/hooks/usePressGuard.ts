import { useEffect, useRef, useState } from "react";

/** Longer than the gap between the two taps of a double tap. */
export const ARM_DELAY_MS = 500;

/** What a guard reads of a click. `detail` is 0 for a click with no pointer of its own: Enter, Space, a screen reader. */
export interface GuardedClick {
  preventDefault: () => void;
  stopPropagation: () => void;
  detail?: number;
}

/** Capture props for a container: a click that does not count is stopped before it reaches the control. */
export interface PressCaptureProps {
  onPointerDownCapture: () => void;
  onPointerCancelCapture: () => void;
  onClickCapture: (e: GuardedClick) => void;
}

/** Props for one button: `action` runs only on a click that counts. */
export interface PressProps {
  onPointerDown: () => void;
  onPointerCancel: () => void;
  onClick: (e?: { detail?: number }) => void;
}

export interface PressLatch {
  guardProps: PressCaptureProps;
  pressProps: (action: () => void) => PressProps;
}

/**
 * The one press latch every guard in the app uses for presses that wait for
 * content to come to rest. What it stops is the second tap of a double tap
 * landing on whatever slid in or rendered under the finger, told from a tap
 * made once things are at rest. It remembers where a press started, from
 * its pointerdown until the click it ends in, and asks `counts` whether that
 * click counts, given where the press started (`now` at its pointerdown).
 * `started` is null when the click belongs to no earlier press.
 *
 * A press that ends in no click is forgotten: on pointercancel, which is how
 * a browser ends a touch it takes for a scroll, and at the next click that
 * comes with no pointer of its own (`detail` 0), which never belongs to an
 * earlier press. So Enter, Space or a screen reader's activation counts as
 * soon as the guard lets presses through, whatever touches came before it.
 *
 * One limit. A press that ends in a pointerup with no click on the target
 * keeps where it started until the next pointerdown or click: a downward drag the
 * sheet's swipe takes, a mouse press that slides off, a right click. A real
 * tap brings its own pointerdown, which replaces it, and a keyboard or a
 * screen reader clicks with `detail` 0, which ignores it. So only a click
 * with `detail` 1 and no pointerdown of its own is dropped, once. A reset on
 * pointerup would be wrong: the click arrives after the pointerup.
 */
export function usePressLatch<T>(now: T, counts: (started: T | null) => boolean): PressLatch {
  // Where the press in progress started. Null while none is.
  const startedIn = useRef<T | null>(null);
  const down = (): void => {
    startedIn.current = now;
  };
  const cancel = (): void => {
    startedIn.current = null;
  };
  const clickCounts = (detail: number | undefined): boolean => {
    const started = detail === 0 ? null : startedIn.current;
    startedIn.current = null;
    return counts(started);
  };
  return {
    guardProps: {
      onPointerDownCapture: down,
      onPointerCancelCapture: cancel,
      onClickCapture: (e) => {
        if (clickCounts(e.detail)) return;
        e.preventDefault();
        e.stopPropagation();
      },
    },
    pressProps: (action) => ({
      onPointerDown: down,
      onPointerCancel: cancel,
      onClick: (e) => {
        if (clickCounts(e?.detail)) action();
      },
    }),
  };
}

/**
 * The latch for a guard that is held or not: while `held`, no click counts,
 * and a press that started while held does not count either, also if it
 * ends after.
 */
export function useHeldPresses(held: boolean): PressLatch {
  return usePressLatch(held, (started) => !held && started !== true);
}

export interface PressGuard {
  /** True from `hold()` until `ARM_DELAY_MS` after it. */
  held: boolean;
  /** Holds every press in the container for `ARM_DELAY_MS`, starting again if it was already held. */
  hold: () => void;
  /** For the container whose presses wait. */
  guardProps: PressCaptureProps & { "data-press-guard": "waiting" | undefined };
}

/**
 * A press guard that holds for half a second when asked. For a press that
 * swaps the content under the finger, such as the barcode block's Search by
 * name, whose place the browse lists take: the second tap of a double tap
 * would open a row. Holding at every width is right here, unlike a sheet's
 * entry, because the content swaps at every width and a mouse's double
 * click lands its second click on the new content just the same.
 */
export function usePressGuard(): PressGuard {
  // The hold in force, a new number for each, so a second hold starts the half second again.
  const [holdId, setHoldId] = useState<number | null>(null);
  useEffect(() => {
    if (holdId === null) return;
    const timer = setTimeout(() => setHoldId(null), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [holdId]);
  const held = holdId !== null;
  const { guardProps } = useHeldPresses(held);
  return {
    held,
    hold: () => setHoldId((n) => (n ?? 0) + 1),
    guardProps: { ...guardProps, "data-press-guard": held ? "waiting" : undefined },
  };
}
