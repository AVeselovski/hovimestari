"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { restoreFocus } from "@/lib/lastInputModality";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

/**
 * The frame of every guest page: the wordmark, the page title, and one
 * column that fills a phone and stays readable on a wide screen. The column
 * is anchored to the top at every width, so the wordmark and the title sit
 * at the same place on every guest page and nothing above a form moves when
 * its content changes. A line at the top says so while the app is offline.
 */
export function AuthPage({
  title,
  titleId,
  focusTitle = false,
  children,
}: {
  title: string;
  /** The title's id, for a form on the page that takes its name from it. */
  titleId?: string;
  /**
   * Focus the title as the page appears, for a page that replaces another
   * in place, so a screen reader starts at its title. Never a field on a
   * phone, which would raise the keyboard. No ring after a tap.
   */
  focusTitle?: boolean;
  children: ReactNode;
}): ReactElement {
  const t = useTranslations("common");
  const tShell = useTranslations("shell");
  const online = useOnlineStatus();
  const { status } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) restoreFocus(titleRef.current);
  }, [focusTitle]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {(!online || status === "offline") && (
        <p
          role="status"
          className="border-b border-rule bg-surface pt-[calc(var(--safe-top)+0.5rem)] pr-[calc(var(--safe-right)+1rem)] pb-2 pl-[calc(var(--safe-left)+1rem)] text-center text-sm font-medium text-ink"
        >
          {tShell("offline")}
        </p>
      )}
      <main className="mx-auto w-full max-w-auth px-4 pt-[calc(var(--safe-top)+2.5rem)] pb-[calc(var(--safe-bottom)+2rem)] md:pt-24">
        <p className="font-display text-2xl font-semibold tracking-tight text-ink">{t("appName")}</p>
        <div className="mt-2 mb-8 rule-dashed" />
        <h1
          ref={titleRef}
          id={titleId}
          tabIndex={focusTitle ? -1 : undefined}
          className="mb-6 font-display text-title font-medium text-ink focus:outline-none md:text-title-lg"
        >
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
