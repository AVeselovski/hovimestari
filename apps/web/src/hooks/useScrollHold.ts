import { useCallback, useLayoutEffect, useState } from "react";

// ---------------------------------------------------------------------------
// useScrollHold: keeps a scrolled container still when its content shrinks.
//
// Scrolled to the end of a form, a field that goes away makes the content
// shorter, so the browser pulls the scroll position back by the same amount
// and everything still on screen slides down. This hook keeps that space as
// a blank reserve at the very end instead, so nothing on screen moves. The
// reserve shrinks again as the reader scrolls back up, by exactly what
// leaves the view, so taking it back moves nothing either, and content that
// grows takes its place first.
//
// The container holds two children this hook finds by attribute: the
// content (`data-scroll-hold-content`) and, after it, an empty block
// (`data-scroll-hold-reserve`) whose height is the reserve.
//
// A resize observer on the content does the work: it runs after layout and
// before paint, so the restored position is the only one painted. A scroll
// event that lands first, from the browser's own pull-back, is recognised by
// the content having shrunk since it was last measured, and handled the same
// way.
// ---------------------------------------------------------------------------

/** A callback ref for the scrolling container. */
export type ScrollHoldRef = (el: HTMLElement | null) => void;

export function useScrollHold(enabled: boolean): ScrollHoldRef {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setContainer(el), []);

  useLayoutEffect(() => {
    if (!enabled || !container) return;
    const content = container.querySelector<HTMLElement>(":scope > [data-scroll-hold-content]");
    const spacer = container.querySelector<HTMLElement>(":scope > [data-scroll-hold-reserve]");
    if (!content || !spacer) return;
    const body = container;
    const reserveEl = spacer;
    const contentEl = content;

    let reserve = 0;
    let lastTop = body.scrollTop;
    let lastHeight = contentEl.offsetHeight;

    function setReserve(px: number) {
      const next = Math.max(0, Math.round(px));
      if (next === reserve) return;
      reserve = next;
      reserveEl.style.height = next > 0 ? `${next}px` : "";
    }

    // How far the view reaches past the content's own end.
    const overhang = (top: number) => top + body.clientHeight - (body.scrollHeight - reserve);

    function onContentResize() {
      const height = contentEl.offsetHeight;
      const shrank = height < lastHeight;
      lastHeight = height;
      if (shrank) {
        // Keep the bottom of what was in view reachable, then go back there.
        setReserve(overhang(lastTop));
        if (body.scrollTop !== lastTop) body.scrollTop = lastTop;
      } else {
        // Grown content covers the reserve first.
        setReserve(Math.min(reserve, overhang(body.scrollTop)));
      }
      lastTop = body.scrollTop;
    }

    function onScroll() {
      if (contentEl.offsetHeight < lastHeight) {
        onContentResize();
        return;
      }
      if (reserve > 0) setReserve(Math.min(reserve, overhang(body.scrollTop)));
      lastTop = body.scrollTop;
    }

    const observer = new ResizeObserver(onContentResize);
    observer.observe(contentEl);
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      body.removeEventListener("scroll", onScroll);
      reserveEl.style.height = "";
    };
  }, [enabled, container]);

  return ref;
}
