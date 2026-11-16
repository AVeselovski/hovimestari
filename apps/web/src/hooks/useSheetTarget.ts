import { useCallback, useRef, useState } from "react";
import { useRetainedValue } from "./useRetainedValue";

/** One open of a sheet: a fresh key per open, and the control that opened it. */
export interface SheetOpen {
  key: number;
  /** Where focus goes when the sheet closes. WebKit never focuses a tapped button, so it is named. */
  opener: HTMLElement | null;
}

export interface SheetTarget {
  /** True while the sheet is open. */
  isOpen: boolean;
  /** The open the sheet shows, kept while it slides out. Render the sheet while this is set. */
  shown: SheetOpen | null;
  /** Opens the sheet. A second call while it is open does nothing, so a double tap opens it once. */
  open: (opener: HTMLElement | null) => void;
  close: () => void;
}

/**
 * The open state of a sheet its caller keeps mounted (docs/app/shell.md,
 * "Sheets and dialogs"). The caller renders
 * `{shown && <Sheet key={shown.key} open={isOpen} returnFocusTo={shown.opener} />}`,
 * so every open mounts fresh content and every close slides out with what
 * was on screen.
 */
export function useSheetTarget(): SheetTarget {
  const [target, setTarget] = useState<SheetOpen | null>(null);
  const shown = useRetainedValue(target);
  const countRef = useRef(0);
  const open = useCallback((opener: HTMLElement | null) => {
    setTarget((prev) => prev ?? { key: ++countRef.current, opener });
  }, []);
  const close = useCallback(() => setTarget(null), []);
  return { isOpen: target !== null, shown, open, close };
}
