"use client";

import { btnPrimary, standaloneLinkClass } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";

/**
 * The body of the error pages: what happened, a retry, and the way home.
 * It reads no session, so it renders even when the session is what failed.
 */
export function ErrorFrame({ onRetry }: { onRetry: () => void }): ReactElement {
  const t = useTranslations("errorPage");
  const tCommon = useTranslations("common");
  return (
    <main className="mx-auto min-h-dvh w-full max-w-auth bg-bg px-4 pt-[calc(var(--safe-top)+2.5rem)] pb-[calc(var(--safe-bottom)+2rem)] md:pt-24">
      <p className="font-display text-2xl font-semibold tracking-tight text-ink">{tCommon("appName")}</p>
      <div className="mt-2 mb-8 rule-dashed" />
      <h1 className="mb-4 font-display text-title font-medium text-ink md:text-title-lg">{t("title")}</h1>
      <p role="alert" className="mb-6 text-base text-ink">
        {t("body")}
      </p>
      <button type="button" onClick={onRetry} className={`w-full ${btnPrimary}`}>
        {t("retry")}
      </button>
      <div className="mt-6">
        <Link href="/" className={standaloneLinkClass}>
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
