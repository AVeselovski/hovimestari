import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// PageContainer: the page widths and the one horizontal gutter, so no page
// hand-rolls its own. From `md` up every tab shares one centred 40rem column,
// the header's, so the title never moves between tabs. `narrow` caps the
// content at 36rem inside that column, left-aligned with the title, for
// Settings. The gutter keeps clear of the side insets of a phone on its side.
// ---------------------------------------------------------------------------

const WIDTH_CLASS = {
  narrow: "md:max-w-page-narrow",
  page: "",
} as const;

/** The horizontal gutter, shared with the header so the two line up. */
export const PAGE_GUTTER_CLASS =
  "pr-[calc(var(--safe-right)+1rem)] pl-[calc(var(--safe-left)+1rem)] md:pr-[calc(var(--safe-right)+2rem)] md:pl-8";

/** More room under the last panel than above the first, so a page never ends flush against the tab bar. */
export const PAGE_VERTICAL_PADDING_CLASS = "pt-6 pb-12";

export interface PageContainerProps {
  width: keyof typeof WIDTH_CLASS;
  children: ReactNode;
  /** Classes for the content column, such as the spacing between its sections. */
  className?: string;
}

export function PageContainer({ width, children, className }: PageContainerProps): ReactElement {
  return (
    <div className={`${PAGE_VERTICAL_PADDING_CLASS} ${PAGE_GUTTER_CLASS}`}>
      <div className="mx-auto w-full md:max-w-page">
        <div className={["w-full", WIDTH_CLASS[width], className].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </div>
  );
}
