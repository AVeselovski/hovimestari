import { FoodSearchLauncher } from "@/components/foods/FoodSearchLauncher";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("day") };
}

/** Day: the food search at the top. The day itself comes with its own step. */
export default async function DayPage(): Promise<ReactElement> {
  const t = await getTranslations("shell");
  return (
    <PageContainer>
      <FoodSearchLauncher />
      <EmptyState title={t("empty")} />
    </PageContainer>
  );
}
