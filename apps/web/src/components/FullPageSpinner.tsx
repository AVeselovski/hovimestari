"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** What shows while the session is restored on launch. */
export function FullPageSpinner(): ReactElement {
  const t = useTranslations("components.fullPageSpinner");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg" role="status">
      <svg
        className="h-8 w-8 animate-spin text-accent motion-reduce:[animation-duration:2.5s]"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
