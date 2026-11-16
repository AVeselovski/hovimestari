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

export interface PageContainerProps {
  children: ReactNode;
  /** Classes for the content column, such as the spacing between its sections. */
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps): ReactElement {
  return (
    <div className={`${PAGE_VERTICAL_PADDING_CLASS} ${PAGE_GUTTER_CLASS}`}>
      <div className="mx-auto w-full md:max-w-page">
        <div className={["w-full", className].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </div>
  );
}
