"use client";

import { zShell } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { TabKey } from "./tabs";

/**
 * The page title, in the display face, over the dashed receipt rule. It pads
 * itself clear of the status bar and the side insets. One line, always, so
 * the header is the same height on every tab.
 */
export function AppHeader({ active }: { active: TabKey | null }): ReactElement {
  const t = useTranslations("shell.tabs");
  return (
    <header
      className={`${zShell} shrink-0 bg-bg pt-[calc(var(--safe-top)+1rem)] pr-[calc(var(--safe-right)+1rem)] pl-[calc(var(--safe-left)+1rem)] md:pt-[calc(var(--safe-top)+2rem)] md:pr-[calc(var(--safe-right)+2rem)] md:pl-8`}
    >
      <div className="mx-auto w-full pb-3 rule-dashed md:max-w-page">
        <h1 className="truncate font-display text-title font-medium tracking-tight text-ink md:text-title-lg">
          {active ? t(active) : null}
        </h1>
      </div>
    </header>
  );
}
