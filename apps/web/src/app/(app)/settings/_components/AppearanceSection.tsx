"use client";

import { Card } from "@/components/ui/Card";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** The theme choice. It is kept on this device only. */
export function AppearanceSection(): ReactElement {
  const t = useTranslations("settings.appearance");
  return (
    <Card labelledBy="settings-appearance">
      <Card.Header id="settings-appearance" title={t("title")} />
      <ThemeToggle />
    </Card>
  );
}
