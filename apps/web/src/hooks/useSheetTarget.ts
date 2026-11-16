import { useCallback, useRef, useState } from "react";
import { useRetainedValue } from "./useRetainedValue";

/** One open of a sheet: a fresh key per open, the control that opened it, and what it opens on. */
export interface SheetOpen<T = void> {
  key: number;
  /** Where focus goes when the sheet closes. WebKit never focuses a tapped button, so it is named. */
  opener: HTMLElement | null;
  /** What this open shows, such as the food a form edits. */
  value: T;
}

/** `open`'s arguments after the opener: none for a sheet without a value, else the value. */
type ValueArgs<T> = [T] extends [void] ? [value?: T] : [value: T];

export interface SheetTarget<T = void> {
  /** True while the sheet is open. */
  isOpen: boolean;
  /** The open the sheet shows, kept while it slides out. Render the sheet while this is set. */
  shown: SheetOpen<T> | null;
  /** Opens the sheet. A second call while it is open does nothing, so a double tap opens it once. */
  open: (opener: HTMLElement | null, ...value: ValueArgs<T>) => void;
  close: () => void;
}

/**
 * The open state of a sheet its caller keeps mounted (docs/app/shell.md,
 * "The sheet primitives"). The caller renders
 * `{shown && <Sheet key={shown.key} open={isOpen} returnFocusTo={shown.opener} />}`,
 * so every open mounts fresh content and every close slides out with what
 * was on screen. A sheet that opens on something, such as a stacked form on
 * one food, passes it as `open(opener, value)` and reads it as `shown.value`.
 */
export function useSheetTarget<T = void>(): SheetTarget<T> {
  const [target, setTarget] = useState<SheetOpen<T> | null>(null);
  const shown = useRetainedValue(target);
  const countRef = useRef(0);
  const open = useCallback((opener: HTMLElement | null, ...value: ValueArgs<T>) => {
    setTarget((prev) => prev ?? { key: ++countRef.current, opener, value: value[0] as T });
  }, []);
  const close = useCallback(() => setTarget(null), []);
  return { isOpen: target !== null, shown, open, close };
}
