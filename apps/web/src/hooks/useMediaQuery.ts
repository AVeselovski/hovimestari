import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks whether a media query matches, live.
 *
 * `useSyncExternalStore` reads the current value on every client render, so
 * the first painted frame is already right. A `useState(false)` and an effect
 * would paint the wide-screen branch first and swap it a frame later. The
 * server snapshot is `false`, because the server has no viewport.
 *
 * No screen reads it yet. The bottom sheets in the next pull request use it,
 * through `useIsMobile`, to choose what a phone gets.
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
