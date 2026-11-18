"use client";

import { zPageHeader } from "@/components/ui/styles";
import { useScrolledUnder } from "@/hooks/useScrolledUnder";
import { useRef, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// DayHeader: the date bar and the launcher, kept at the top of the page while
// the day scrolls under them. `position: sticky` in `<main>`, the shell's one
// scroll container, so the phone's overscroll, the toast's room and the
// sheets' scroll lock work as on every page. The shell's header above it
// already keeps the status bar's room.
//
// It owns the room above itself and the clearance under the launcher (the
// `--day-header-*` tokens), so it is in the same place at rest and while it
// stays, and nothing above it scrolls away. Its background is the page's,
// solid. While rows sit under it, its bottom edge shows the rule colour, one
// pixel. At rest at the top the edge is there in the page colour, so the
// header never changes height. No blur, no shadow, no motion.
//
// From lg the two children sit side by side in the tab's two columns.
// ---------------------------------------------------------------------------

export const DAY_HEADER_CLASS =
  `sticky top-0 ${zPageHeader} flex flex-col gap-(--day-header-gap) border-b border-bg bg-bg ` +
  "pt-(--day-header-top) pb-[calc(var(--day-header-clear)-1px)] data-scrolled:border-rule " +
  "lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10";

export function DayHeader({ children }: { children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const under = useScrolledUnder(ref);
  return (
    <div ref={ref} data-day-header="" data-scrolled={under ? "" : undefined} className={DAY_HEADER_CLASS}>
      {children}
    </div>
  );
}
