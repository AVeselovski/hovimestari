"use client";

import { zShell } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { NavLinks } from "./NavLinks";
import type { TabKey } from "./tabs";

/** The phone's tab bar, below `md`. It pads itself clear of the home indicator. */
export function TabBar({ active }: { active: TabKey | null }): ReactElement {
  const t = useTranslations("shell");
  return (
    <nav
      aria-label={t("navLabel")}
      className={`${zShell} shrink-0 border-t border-rule bg-surface pr-[var(--safe-right)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] md:hidden`}
    >
      <ul className="flex">
        <NavLinks active={active} variant="bar" />
      </ul>
    </nav>
  );
}
