import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks whether a media query currently matches, live.
 *
 * `useSyncExternalStore` rather than `useState(false)` + an effect (owner
 * defect, 2026-09-22). The old shape returned `false` on the first render
 * and corrected only once an effect had run, so every consumer painted its
 * DESKTOP branch first and then swapped. On a phone that is at best a flash,
 * and where the desktop branch is a fixed-width overlay it is a panel wider
 * than the screen: `PeriodRangeEditor`'s popover is a hard 400px, which on a
 * 390px viewport overflows until the effect lands — and never stops
 * overflowing if the effect is delayed or the tree suspends.
 *
 * This subscribes to the same `change` event but reads the CURRENT value
 * synchronously on every client render. The server snapshot stays `false`,
 * which is what SSR must render (there is no viewport there); React uses it
 * during hydration and switches to the live value immediately after, without
 * an effect in between.
 *
 * `useIsMobile` and the per-chart "narrow" gates (`BudgetBurnUpChart`) all
 * consume this — see `docs/design/ui-overhaul.md`'s
 * Implementation deviations for why each surface passes its own query
 * rather than sharing one threshold.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  // No viewport on the server, so nothing can match there.
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
