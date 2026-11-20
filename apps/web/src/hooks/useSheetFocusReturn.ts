import { focusIsInsideOrLost } from "@/lib/focus";
import { restoreFocus } from "@/lib/lastInputModality";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

interface SheetFocusReturn {
  open: boolean;
  /** The sheet's Popup. */
  popupRef: RefObject<HTMLElement | null>;
  returnFocusTo?: HTMLElement | null;
  restoreFocusOnClose: boolean;
  /** The Popup of the sheet a nested sheet is stacked on, or null for a sheet on the page. */
  parentPopupRef: RefObject<HTMLElement | null> | null;
}

/**
 * A `BottomSheet`'s focus return (point 3 at the top of BottomSheet.tsx).
 * Captures the focused element when `open` turns true, and restores focus the
 * moment it turns false: to `returnFocusTo` when it is still in the document,
 * else to that captured element. A nested sheet never falls back to <body>: it
 * hands focus to the sheet underneath.
 *
 * Only while focus is still inside the closing sheet, has been dropped on
 * <body>, or has not moved since the sheet opened, so a sheet closed by an
 * action that moved focus elsewhere leaves it there. Base UI moves focus in a
 * frame after opening, and a sheet closed before that frame still holds the
 * stale focus it opened on.
 */
export function useSheetFocusReturn({
  open,
  popupRef,
  returnFocusTo,
  restoreFocusOnClose,
  parentPopupRef,
}: SheetFocusReturn): void {
  // Read by the restore when the sheet closes, so the latest element wins.
  const returnFocusToRef = useRef(returnFocusTo);
  const restoreFocusOnCloseRef = useRef(restoreFocusOnClose);
  useLayoutEffect(() => {
    returnFocusToRef.current = returnFocusTo;
    restoreFocusOnCloseRef.current = restoreFocusOnClose;
  });

  const previouslyFocusedRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (open) previouslyFocusedRef.current = document.activeElement;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return () => {
      // The latest value: the update that closes the sheet may have turned it off.
      if (!restoreFocusOnCloseRef.current) return;
      const named = returnFocusToRef.current;
      const captured = previouslyFocusedRef.current;
      // A `returnFocusTo` that has left the document (its row re-rendered
      // away) falls back to the element captured at open.
      const target = parentPopupRef
        ? ([named, captured].find((el) => el?.isConnected && el !== document.body) ?? parentPopupRef.current)
        : named?.isConnected
          ? named
          : captured;
      const unmoved = captured !== null && document.activeElement === captured;
      if (target instanceof HTMLElement && (unmoved || focusIsInsideOrLost(popupRef.current))) restoreFocus(target);
    };
  }, [open, parentPopupRef, popupRef]);
}
