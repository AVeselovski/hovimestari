import type { Drawer } from "@base-ui/react/drawer";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export interface EntryPressGuard {
  /** Pass to `Drawer.Root`'s `onOpenChangeComplete`: an open that completes ends the entry. */
  onOpenChangeComplete: (open: boolean) => void;
  /** True for a press outside the popup that lands before it has finished entering. */
  refuses: (details: Drawer.Root.ChangeEventDetails) => boolean;
  /**
   * After refusing a press outside: puts focus back in the popup, which the
   * press took it out of.
   */
  keepFocusInside: () => void;
}

/**
 * The entry rule every overlay on Base UI's Drawer shares (`BottomSheet`,
 * `MobileNavDrawer`): until the popup has finished sliding in, a press
 * outside it is refused. The second tap of a double tap on the control that
 * opened it lands on what already covers that control, and must not close an
 * overlay the reader has not seen yet. Escape and a swipe are not affected.
 *
 * A press outside blurs whatever had focus (the browser does that on
 * mousedown, before Base UI sees the press), so a refused one would leave
 * focus on <body>, where Tab walks into the page behind. `keepFocusInside`
 * puts it back: after a mouse press on the field it left, caret and all;
 * after a touch on the popup itself, not on a field, which on a phone would
 * raise the keyboard the reader just put away.
 */
export function useEntryPressGuard(open: boolean, popupRef: RefObject<HTMLElement | null>): EntryPressGuard {
  // Whether the popup has finished entering since it last opened.
  const enteredRef = useRef(false);
  useLayoutEffect(() => {
    if (open) enteredRef.current = false;
  }, [open]);

  const pressRef = useRef<{ from: Element | null; mouse: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    // Capture phase, before the press's mousedown moves focus.
    const onPointerDown = (e: PointerEvent) => {
      pressRef.current = { from: document.activeElement, mouse: e.pointerType === "mouse" };
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return {
    onOpenChangeComplete: (isOpen) => {
      if (isOpen) enteredRef.current = true;
    },
    refuses: (details) => details.reason === "outside-press" && !enteredRef.current,
    keepFocusInside: () => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const popup = popupRef.current;
      const from = pressRef.current?.mouse ? pressRef.current.from : null;
      const target = from instanceof HTMLElement && from.isConnected && popup?.contains(from) ? from : popup;
      target?.focus({ preventScroll: true });
    },
  };
}
