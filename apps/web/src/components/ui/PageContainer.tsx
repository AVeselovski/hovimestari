import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// PageContainer: the page widths and the one horizontal gutter, so no page
// hand-rolls its own. From `md` up every tab shares one centred 40rem column,
// the header's, so the title never moves between tabs and the header's rule
// spans exactly the content under it. The gutter keeps clear of the side
// insets of a phone on its side.
// ---------------------------------------------------------------------------

/** The horizontal gutter, shared with the header so the two line up. */
export const PAGE_GUTTER_CLASS =
  "pr-[calc(var(--safe-right)+1rem)] pl-[calc(var(--safe-left)+1rem)] md:pr-[calc(var(--safe-right)+2rem)] md:pl-8";

/** More room under the last panel than above the first, so a page never ends flush against the tab bar. */
export const PAGE_VERTICAL_PADDING_CLASS = "pt-6 pb-12";

/** The end room of a page whose last rows a toast can cover: the tallest toast and its gap. */
export const PAGE_TOAST_END_CLASS = "pb-toast-clearance";

/** The top of a page the shell shows no title over (the Day tab): its own first row is the header. */
export const PAGE_UNTITLED_TOP_CLASS = "pt-2 md:pt-8";

export interface PageContainerProps {
  children: ReactNode;
  /** Classes for the content column, such as the spacing between its sections. */
  className?: string;
  /** The column widens from `lg` to `max-w-page-wide`, for a page laid out in two columns there. */
  wide?: boolean;
  /** The page's last rows hold actions a toast could cover: it keeps the tallest toast's room at its end. */
  clearToast?: boolean;
  /** The shell shows no title over this page, so it starts close under the status bar. */
  untitled?: boolean;
}

export function PageContainer({
  children,
  className,
  wide = false,
  clearToast = false,
  untitled = false,
}: PageContainerProps): ReactElement {
  const [top, bottom] = PAGE_VERTICAL_PADDING_CLASS.split(" ");
  const padding = `${untitled ? PAGE_UNTITLED_TOP_CLASS : top} ${clearToast ? PAGE_TOAST_END_CLASS : bottom}`;
  return (
    <div className={`${padding} ${PAGE_GUTTER_CLASS}`}>
      <div className={`mx-auto w-full md:max-w-page${wide ? " lg:max-w-page-wide" : ""}`}>
        <div className={["w-full", className].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </div>
  );
}
