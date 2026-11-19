import { RecipesTab } from "@/components/recipes/RecipesTab";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("recipes") };
}

export default function RecipesPage(): ReactElement {
  return <RecipesTab />;
}
