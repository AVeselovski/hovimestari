"use client";

import { zShell } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { NavLinks } from "./NavLinks";
import type { TabKey } from "./tabs";

/**
 * The side rail from `md` up: the wordmark and the same four tabs. Its top
 * padding puts the wordmark on the page title's baseline.
 */
export function SideRail({ active }: { active: TabKey | null }): ReactElement {
  const t = useTranslations("shell");
  const tCommon = useTranslations("common");
  return (
    <nav
      aria-label={t("navLabel")}
      className={`${zShell} hidden w-rail shrink-0 flex-col border-r border-rule bg-surface pt-[calc(var(--safe-top)+2.5rem)] pr-3 pb-6 pl-[calc(var(--safe-left)+0.75rem)] md:flex`}
    >
      <p className="px-3 font-display text-2xl font-semibold tracking-tight text-ink">{tCommon("appName")}</p>
      <ul className="mt-8 flex flex-col gap-1">
        <NavLinks active={active} variant="rail" />
      </ul>
    </nav>
  );
}
