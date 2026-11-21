import { RecipePage } from "@/components/recipes/RecipePage";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("recipes") };
}

/** One recipe. The page reads it on the device, as every page reads its data. */
export default async function RecipeRoute({ params }: { params: Promise<{ id: string }> }): Promise<ReactElement> {
  const { id } = await params;
  return <RecipePage key={id} id={id} />;
}
