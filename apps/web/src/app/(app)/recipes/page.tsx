import { RecipesTab } from "@/components/recipes/RecipesTab";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("recipes") };
}

/** Recipes: recipes, saved meals and own foods. `RecipesTab` reads `?show=`, so it renders inside Suspense. */
export default function RecipesPage(): ReactElement {
  return (
    <Suspense>
      <RecipesTab />
    </Suspense>
  );
}
