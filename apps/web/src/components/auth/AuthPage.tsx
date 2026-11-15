"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

/**
 * The frame of every guest page: the wordmark, the page title, and one
 * column that fills a phone and stays readable on a wide screen. The column
 * is anchored to the top at every width, so the wordmark and the title sit
 * at the same place on every guest page and nothing above a form moves when
 * its content changes. A line at the top says so while the app is offline.
 */
export function AuthPage({ title, children }: { title: string; children: ReactNode }): ReactElement {
  const t = useTranslations("common");
  const tShell = useTranslations("shell");
  const online = useOnlineStatus();
  const { status } = useAuth();

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
        <h1 className="mb-6 font-display text-title font-medium text-ink md:text-title-lg">{title}</h1>
        {children}
      </main>
    </div>
  );
}
