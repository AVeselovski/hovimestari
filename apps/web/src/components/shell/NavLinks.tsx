"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";
import { TABS, type TabKey } from "./tabs";

/**
 * The four tab links, laid out by the caller: a row of cells in the phone's
 * tab bar, a column in the side rail. The current tab is in the accent and
 * carries `aria-current="page"`.
 */
export function NavLinks({ active, variant }: { active: TabKey | null; variant: "bar" | "rail" }): ReactElement {
  const t = useTranslations("shell.tabs");
  const linkClass =
    variant === "bar"
      ? "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-xs font-semibold select-none active:bg-surface-raised"
      : "flex min-h-11 items-center gap-3 rounded-control px-3 text-base font-semibold hover:bg-surface-raised active:bg-surface-raised";

  return (
    <>
      {TABS.map((tab) => {
        const current = tab.key === active;
        return (
          <li key={tab.key} className={variant === "bar" ? "flex-1" : undefined}>
            <Link
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={`${linkClass} ${focusRing} transition-colors duration-150 ${current ? "text-accent" : "text-ink-muted hover:text-ink"}`}
            >
              <Icon name={tab.icon} className="h-6 w-6" strokeWidth={current ? 2 : 1.5} />
              {t(tab.key)}
            </Link>
          </li>
        );
      })}
    </>
  );
}
