"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** A tab with nothing built in it yet. It says so plainly and promises nothing. */
export function EmptyTab(): ReactElement {
  const t = useTranslations("shell");
  return (
    <PageContainer width="page">
      <EmptyState title={t("empty")} />
    </PageContainer>
  );
}
