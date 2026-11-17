import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

// ---------------------------------------------------------------------------
// useSheetNavigation: the views of one tall sheet as a stack, such as the log
// sheet's search and a food opened from it. Moving between them is
// navigation, not a new sheet, so the sheet's top edge never moves.
//
// - Opening a view remembers where the view under it was scrolled to and
//   which row opened the new one, scrolls the new view to its top and puts
//   focus on Back.
// - Back returns to the view under it as it was: the same scroll position,
//   with focus on the row that opened the view just left. A row that is gone
//   gives focus to the root's field, or to Back in a view deeper down.
// - Reset returns to the root view at its top, with focus in its field.
// - Replace puts a new state of the same view on top, such as a meal just
//   archived, and moves neither the scroll nor the focus.
//
// The scroll and the focus are placed in a layout effect once the new view
// has rendered, before it is painted, so no frame shows the old scroll.
// ---------------------------------------------------------------------------

/** Where focus goes once the view on top has rendered. */
type Pending = { focus: "back" } | { focus: "field" } | { focus: "row"; row: string | null; scroll: number };

interface Level<V> {
  view: V;
  /** Where this view was scrolled to when the view over it opened. */
  scroll: number;
  /** A selector for the row that opened the view over it. */
  row: string | null;
}

export interface SheetNavigationRefs {
  /** An element inside the sheet's scrolling body. */
  content: RefObject<HTMLElement | null>;
  /** The Back button of a view over the root. */
  back: RefObject<HTMLElement | null>;
  /** The root view's field, such as the search field. */
  field: RefObject<HTMLElement | null>;
}

export interface SheetNavigation<V> {
  /** The view on top. */
  view: V;
  /** How many views are open, the root counted: 1 on the root. */
  depth: number;
  /** Opens `view` over the one on top. `row` selects the row that opened it, for Back. */
  open: (view: V, row: string | null) => void;
  /** Puts `view` in place of the one on top, as if it had opened from the view under it. */
  swap: (view: V) => void;
  /** Puts a new state of the view on top in its place, leaving scroll and focus where they are. */
  replace: (view: V) => void;
  /** Returns to the view under the one on top. */
  back: () => void;
  /** Returns to the root view, at its top, with focus in its field. */
  reset: () => void;
}

/** The sheet's scrolling body, found from an element inside it. */
function bodyOf(ref: RefObject<HTMLElement | null>): HTMLElement | null {
  return ref.current?.closest<HTMLElement>("[data-sheet-body]") ?? null;
}

export function useSheetNavigation<V>(root: V, refs: SheetNavigationRefs): SheetNavigation<V> {
  const [stack, setStack] = useState<Level<V>[]>(() => [{ view: root, scroll: 0, row: null }]);
  const pending = useRef<Pending | null>(null);
  // The stack as last rendered, for Back, which reads where the view under the top was left.
  const stackRef = useRef(stack);
  useLayoutEffect(() => {
    stackRef.current = stack;
  }, [stack]);
  const { content, back: backRef, field } = refs;

  const open = useCallback(
    (view: V, row: string | null) => {
      const scroll = bodyOf(content)?.scrollTop ?? 0;
      pending.current = { focus: "back" };
      setStack((prev) => {
        const below = prev.slice(0, -1);
        const top = { ...prev[prev.length - 1], scroll, row };
        return [...below, top, { view, scroll: 0, row: null }];
      });
    },
    [content],
  );

  const swap = useCallback((view: V) => {
    pending.current = { focus: "back" };
    setStack((prev) => (prev.length === 1 ? prev : [...prev.slice(0, -1), { view, scroll: 0, row: null }]));
  }, []);

  const replace = useCallback((view: V) => {
    setStack((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], view }]);
  }, []);

  const back = useCallback(() => {
    const now = stackRef.current;
    if (now.length === 1) return;
    const below = now[now.length - 2];
    pending.current = { focus: "row", row: below.row, scroll: below.scroll };
    // Two presses before a render pop two views, each reading the one under it.
    stackRef.current = now.slice(0, -1);
    setStack((prev) => (prev.length === 1 ? prev : prev.slice(0, -1)));
  }, []);

  const reset = useCallback(() => {
    pending.current = { focus: "field" };
    setStack((prev) => [{ ...prev[0], scroll: 0, row: null }]);
  }, []);

  // Place the scroll and focus once the new view is on screen.
  useLayoutEffect(() => {
    const target = pending.current;
    if (target === null) return;
    pending.current = null;
    const body = bodyOf(content);
    if (target.focus === "back") {
      if (body) body.scrollTop = 0;
      backRef.current?.focus({ preventScroll: true });
      return;
    }
    if (target.focus === "field") {
      if (body) body.scrollTop = 0;
      field.current?.focus({ preventScroll: true });
      return;
    }
    if (body) body.scrollTop = target.scroll;
    const row = target.row ? content.current?.querySelector<HTMLElement>(target.row) : null;
    const fallback = stack.length === 1 ? field.current : backRef.current;
    (row ?? fallback)?.focus({ preventScroll: true });
  }, [stack, content, backRef, field]);

  return { view: stack[stack.length - 1].view, depth: stack.length, open, swap, replace, back, reset };
}
