"use client";

import { useConfirmedDelete, type ConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { deleteRecipe } from "@/lib/api/recipes";
import { getErrorCode } from "@/lib/errors";
import { afterRecipeGone } from "@/lib/invalidation";
import type { RecipeSummary } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// useRecipeDelete: the one delete of a recipe, behind the recipe page and the
// editor. It asks first: "Delete Shakshuka?", with the line that days it was
// on keep their figures. A recipe already gone, deleted on another device,
// counts as done, since what the person asked for is true. Then the recipe
// leaves every cached list (`afterRecipeGone`), and the host does what its
// own view needs (`onDone`).
// ---------------------------------------------------------------------------

export function useRecipeDelete({
  onDone,
  focusAfter,
}: {
  onDone: (recipe: RecipeSummary) => void;
  focusAfter?: (opener: HTMLElement | null, recipe: RecipeSummary) => HTMLElement | null;
}): ConfirmedDelete<RecipeSummary> {
  const t = useTranslations("recipes.page");
  const client = useQueryClient();
  return useConfirmedDelete<RecipeSummary>({
    copy: (recipe) => ({ title: t("deleteTitle", { name: recipe.name }), message: t("deleteBody") }),
    run: (recipe) =>
      deleteRecipe(recipe.id).catch((err: unknown) => {
        if (getErrorCode(err) !== "recipe_not_found") throw err;
      }),
    onDone: (_result, recipe) => {
      onDone(recipe);
      void afterRecipeGone(client, recipe.id);
    },
    focusAfter,
  });
}
