import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// PageContainer: the page widths and the one horizontal gutter, so no page
// hand-rolls its own. From `md` up every tab shares one centred 40rem column,
// the header's, so the title never moves between tabs and the header's rule
// spans exactly the content under it. The gutter keeps clear of the side
// insets of a phone on its side.
// ---------------------------------------------------------------------------

/** The horizontal gutter, shared with the header so the two line up. */
export const PAGE_GUTTER_CLASS = "pr-(--page-pad-right) pl-(--page-pad-left)";

/** More room under the last panel than above the first, so a page never ends flush against the tab bar. */
export const PAGE_VERTICAL_PADDING_CLASS = "pt-6 pb-12";

/** The end room of a page whose last rows a toast can cover: the tallest toast and its gap. */
export const PAGE_TOAST_END_CLASS = "pb-toast-clearance";

/** Half that end room, for a recipe's page: a tall toast may cover part of its last row while it shows. */
export const PAGE_TOAST_END_HALF_CLASS = "pb-toast-clearance-half";

/**
 * The top of a page the shell shows no title over (the Day tab): none. Its
 * own first row is a header that stays at the top while the page scrolls,
 * and it keeps the room above itself, so it never moves when it starts to stay.
 */
export const PAGE_UNTITLED_TOP_CLASS = "pt-0";

const TOAST_END_CLASS = { full: PAGE_TOAST_END_CLASS, half: PAGE_TOAST_END_HALF_CLASS } as const;

export interface PageContainerProps {
  children: ReactNode;
  /** Classes for the content column, such as the spacing between its sections. */
  className?: string;
  /** The column widens from `lg` to `max-w-page-wide`, for a page laid out in two columns there. */
  wide?: boolean;
  /**
   * A toast could cover the page's last rows. `"full"` keeps the tallest toast's room at its end, so no toast
   * covers them. `"half"` keeps half of it, the room the owner chose for a recipe's page, where a tall toast may
   * cover part of the last row for the seconds it shows.
   */
  clearToast?: "full" | "half";
  /** The shell shows no title over this page: it starts flush, and its own header keeps the room above it. */
  untitled?: boolean;
}

export function PageContainer({
  children,
  className,
  wide = false,
  clearToast,
  untitled = false,
}: PageContainerProps): ReactElement {
  const [top, bottom] = PAGE_VERTICAL_PADDING_CLASS.split(" ");
  const end = clearToast === undefined ? bottom : TOAST_END_CLASS[clearToast];
  const padding = `${untitled ? PAGE_UNTITLED_TOP_CLASS : top} ${end}`;
  return (
    <div className={`${padding} ${PAGE_GUTTER_CLASS}`}>
      <div className={`mx-auto w-full md:max-w-page${wide ? " lg:max-w-page-wide" : ""}`}>
        <div className={["w-full", className].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </div>
  );
}
