import { EmptyTab } from "@/components/shell/EmptyTab";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("day") };
}

export default function DayPage(): ReactElement {
  return <EmptyTab />;
}
