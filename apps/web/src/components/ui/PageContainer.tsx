import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// PageContainer — the app's three page widths (docs/design/ui-overhaul.md
// §b), replacing the ad-hoc `mx-auto max-w-*` wrapper every page used to
// hand-roll with its own width and its own gutter/padding values. One
// component makes the width rule enforceable: `narrow` (settings, vault
// create, auth, account forms), `default` (dashboard, spending, budgets,
// buckets, tax, net worth, account lists/detail), `wide` (transactions,
// recurring).
// ---------------------------------------------------------------------------

const WIDTH_CLASS = {
  narrow: "max-w-page-narrow",
  default: "max-w-page-default",
  wide: "max-w-page-wide",
} as const;

// The one page-level horizontal gutter, shared by PageContainer, the app
// header and its mobile control strip (AppHeader.tsx) so the three cannot
// drift apart — see docs/design/ui-overhaul.md.
export const PAGE_GUTTER_CLASS = "px-4 md:px-6 lg:px-8";

// More room under the last panel than above the first (owner, 2026-09-21):
// a page that ends flush against the viewport edge reads as cut off, and the
// extra space also clears the mobile control strip on a short scroll. The
// floating Add button's clearance on `<main>` is computed from the bottom
// half (`floatingActionClearanceBelowMd` in styles.ts).
export const PAGE_VERTICAL_PADDING_CLASS = "pt-6 pb-12";

export interface PageContainerProps {
  width: keyof typeof WIDTH_CLASS;
  children: ReactNode;
  className?: string;
}

export function PageContainer({ width, children, className }: PageContainerProps): ReactElement {
  const classes = ["mx-auto w-full", PAGE_VERTICAL_PADDING_CLASS, PAGE_GUTTER_CLASS, WIDTH_CLASS[width], className]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}
