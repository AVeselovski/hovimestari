"use client";

import { PAGE_GUTTER_CLASS } from "@/components/ui/PageContainer";
import { zShell } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { TabKey } from "./tabs";

/**
 * The page title, in the display face, over the dashed receipt rule. It pads
 * itself clear of the status bar and the side insets. One line, always, so
 * the header is the same height on every tab.
 *
 * The Day tab shows no title: its date bar is the header there, so the first
 * screen goes to the day's entries. The page keeps its one h1, the tab's
 * name, visually hidden, as every tab names its h1.
 */
export function AppHeader({ active }: { active: TabKey | null }): ReactElement {
  const t = useTranslations("shell.tabs");
  const title = active ? t(active) : null;
  if (active === "day") {
    return (
      <header className={`${zShell} shrink-0 bg-bg pt-[var(--safe-top)]`}>
        <h1 className="sr-only">{title}</h1>
      </header>
    );
  }
  return (
    <header
      className={`${zShell} shrink-0 bg-bg pt-[calc(var(--safe-top)+1rem)] md:pt-[calc(var(--safe-top)+2rem)] ${PAGE_GUTTER_CLASS}`}
    >
      <div className="mx-auto w-full pb-3 rule-dashed md:max-w-page">
        <h1 className="truncate font-display text-title font-medium tracking-tight text-ink md:text-title-lg">
          {title}
        </h1>
      </div>
    </header>
  );
}
