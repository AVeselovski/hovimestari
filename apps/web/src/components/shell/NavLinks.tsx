"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { dayTabHref, useShownDay } from "@/lib/shownDay";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";
import { TABS, type TabKey } from "./tabs";

/**
 * The four tab links, laid out by the caller: a row of cells in the phone's
 * tab bar, a column in the side rail. The current tab is in the accent and
 * carries `aria-current="page"`.
 *
 * From another tab the Day link leads back to the day the Day tab last
 * showed by its address (`lib/shownDay.ts`). On the Day tab it leads to
 * today, so a press of the current tab is the way back to today.
 */
export function NavLinks({ active, variant }: { active: TabKey | null; variant: "bar" | "rail" }): ReactElement {
  const t = useTranslations("shell.tabs");
  const shownDay = useShownDay();
  const linkClass =
    variant === "bar"
      ? "flex min-h-tab-bar flex-col items-center justify-center gap-1 px-1 py-1.5 text-xs font-semibold select-none active:bg-surface-raised"
      : "flex min-h-11 items-center gap-3 rounded-control px-3 text-base font-semibold hover:bg-surface-raised active:bg-surface-raised";

  return (
    <>
      {TABS.map((tab) => {
        const current = tab.key === active;
        const href = tab.key === "day" && !current ? dayTabHref(shownDay) : tab.href;
        return (
          <li key={tab.key} className={variant === "bar" ? "flex-1" : undefined}>
            <Link
              href={href}
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
