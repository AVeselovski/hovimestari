import { useMediaQuery } from "./useMediaQuery";

/** The app's single `md` breakpoint (docs/app/shell.md), as a media query. */
export const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Whether the viewport is below the app's one `md` breakpoint, live. Only for
 * a value CSS cannot express or a choice between two overlays that are never
 * open at first paint. Anything visible at first paint is chosen by CSS.
 *
 * No screen reads it yet. The bottom sheets in the next pull request do.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
