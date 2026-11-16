"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The note that the app gives no nutrition or medical advice. It sits
 * wherever targets are set: the first-run page, the targets sheet and the
 * Targets section of Settings.
 */
export function NotAdviceNote({ className }: { className?: string }): ReactElement {
  const t = useTranslations("targets");
  return <p className={["text-sm text-ink-muted", className].filter(Boolean).join(" ")}>{t("note")}</p>;
}
