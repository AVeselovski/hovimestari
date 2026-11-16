import { DayTab } from "@/components/day/DayTab";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("day") };
}

/** Day: one day, its summary and its entries. `DayTab` reads `?date=`, so it renders inside Suspense. */
export default function DayPage(): ReactElement {
  return (
    <Suspense>
      <DayTab />
    </Suspense>
  );
}
