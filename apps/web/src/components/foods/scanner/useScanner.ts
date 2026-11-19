"use client";

import { useSheetTarget, type SheetTarget } from "@/hooks/useSheetTarget";
import type { BarcodeFormat } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { BARCODE_RESULT_ATTRIBUTE } from "../BarcodeResult";

// ---------------------------------------------------------------------------
// useScanner: the log sheet's side of the scanner. It opens the scanner
// sheet from the camera button and takes what comes back:
//
// - A read sets the search field's text to the code and closes the scanner,
//   both on screen at once, then looks the code up with its format, as if
//   Look up were pressed. The status line says "Barcode read: {code}." for
//   its six seconds. The camera button has turned into the clear cross, so
//   focus goes to the result block rather than back to it.
// - **Type the number** closes the scanner and puts focus in the search
//   field, so the keyboard rises on a tap there.
// - A swipe, a tap above the sheet or Escape closes it, and focus goes back
//   to the camera button, which is still there because nothing was typed.
//
// The host places focus itself in the commit that closes the sheet, once
// the block it focuses is on screen, and the sheet's own focus return is
// off for that close.
// ---------------------------------------------------------------------------

export interface ScannerOptions {
  /** Sets the search field's text, as typing does. */
  setText: (text: string) => void;
  /** `useBarcodeMode`'s lookup. */
  lookUp: (code: string, format?: BarcodeFormat) => void;
  /** Puts a note on the status line. */
  say: (text: string) => void;
  /** The search field. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The search view's content, which holds the result block. */
  contentRef: RefObject<HTMLElement | null>;
}

export interface Scanner {
  /** The scanner sheet's open state, for `FoodSheetStack`. */
  sheet: SheetTarget;
  /** Opens the scanner from the camera button. */
  open: (opener: HTMLElement) => void;
  /** False for a close after which the host places focus. */
  restoreFocusOnClose: boolean;
  onRead: (code: string, format: BarcodeFormat | undefined) => void;
  onTypeNumber: () => void;
}

export function useScanner({ setText, lookUp, say, inputRef, contentRef }: ScannerOptions): Scanner {
  const t = useTranslations("foods.scan");
  const sheet = useSheetTarget();
  const [hostFocus, setHostFocus] = useState(false);
  // Where focus goes once the sheet is closed, set by the press that closed it.
  const focusNext = useRef<"block" | "field" | null>(null);

  // After every render: the block mounts in the same commit as the close, so it is there to take focus.
  useLayoutEffect(() => {
    const next = focusNext.current;
    if (next === null || sheet.isOpen) return;
    focusNext.current = null;
    const target =
      next === "field"
        ? inputRef.current
        : contentRef.current?.querySelector<HTMLElement>(`[${BARCODE_RESULT_ATTRIBUTE}]`);
    target?.focus({ preventScroll: true });
  });

  return {
    sheet,
    open: (opener) => {
      focusNext.current = null;
      setHostFocus(false);
      sheet.open(opener);
    },
    restoreFocusOnClose: !hostFocus,
    onRead: (code, format) => {
      // A read comes from the decode loop, not from a press, so React would
      // render it later, and a fast answer could land while the sheet still
      // reads the old text with the scanner open: a found food would not
      // open. The field's text and the close are on screen first, then the
      // lookup goes.
      flushSync(() => {
        focusNext.current = "block";
        setHostFocus(true);
        setText(code);
        say(t("read", { code }));
        sheet.close();
      });
      lookUp(code, format);
    },
    onTypeNumber: () => {
      focusNext.current = "field";
      setHostFocus(true);
      sheet.close();
    },
  };
}
