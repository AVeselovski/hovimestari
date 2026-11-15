import { useMediaQuery } from "./useMediaQuery";

/** The app's single `md` breakpoint (docs/app/mobile-responsive-shell.md), as a media query. */
export const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Tracks whether the viewport is currently below the app's single `md`
 * breakpoint, live — e.g. for chart tick-density gates ("every other tick
 * below `md`"). A thin wrapper over `useMediaQuery` pinned to the app's one
 * shared breakpoint.
 *
 * Shared so every chart's below-`md` behaviour stays in sync by
 * construction.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
