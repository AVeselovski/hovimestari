import { sheetTabTarget } from "@/lib/sheetTab";
import { useEffect, type RefObject } from "react";

/**
 * Keeps Tab and Shift+Tab inside an open sheet while it is the top-most one,
 * in the same keydown (see `lib/sheetTab.ts` for why Base UI's own trap is not
 * enough on its own). A sheet with a sheet stacked on it, which Base UI marks
 * `data-nested-drawer-open`, leaves Tab to that one. A sheet that is closing
 * has stopped listening. A key a control inside the sheet already handled
 * (`defaultPrevented`) is left alone, and so is a Tab pressed while an input
 * method is composing text.
 */
export function useSheetTabWrap(open: boolean, popupRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Tab" || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const popup = popupRef.current;
      if (!popup || !popup.hasAttribute("data-open") || popup.hasAttribute("data-nested-drawer-open")) return;
      const target = sheetTabTarget(popup, document.activeElement, e.shiftKey);
      if (target === null) return;
      e.preventDefault();
      target.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, popupRef]);
}
