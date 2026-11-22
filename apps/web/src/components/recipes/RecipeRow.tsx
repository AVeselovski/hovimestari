"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { isPlainPress, markOpenedInApp } from "@/lib/recipeNav";
import type { RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";
import { RecipeFiguresLine } from "./RecipeFiguresLine";
import { useRecipeMeta } from "./useRecipeMeta";

// ---------------------------------------------------------------------------
// RecipeRow: one recipe in the Recipes tab's list, a link to its page, at
// least 56 pixels tall. Its name, two lines at most, then "Serves 2 · 25 min",
// then one serving's calories and protein, each figure after its dot in the
// macro's hue, in the monospaced face. The figures keep one line at every
// width, so rows with one-line names are all one height.
// Read aloud it always does (`RecipeFiguresLine`). While the list is in the
// order of the latest day, a third line says that day, "On a day Sat 21 Nov",
// or "Not on a day yet". A favourite's star sits at the end, and every row
// keeps that place, so the names of a list line up.
//
// A plain press tells the list (`onLeave`), which keeps its place for the way
// back (lib/recipeNav.ts). A press that opens the recipe elsewhere, in a new
// tab or window, keeps nothing, since this list stays where it is.
// ---------------------------------------------------------------------------

/** The attribute a recipe row's link carries, so focus can find it again. */
export const RECIPE_ROW_ATTRIBUTE = "data-recipe-row";

export interface RecipeRowProps {
  recipe: RecipeSummary;
  /** A plain press is leaving for the recipe's page. */
  onLeave: (recipeId: string) => void;
  /** A third line, under the figures: the latest day the recipe is on, while the list is in that order. */
  lastOn?: string;
}

export function RecipeRow({ recipe, onLeave, lastOn }: RecipeRowProps): ReactElement {
  const t = useTranslations("recipes.list");
  const meta = useRecipeMeta();
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={`/recipes/${recipe.id}`}
        onClick={(e) => {
          if (!isPlainPress(e)) return;
          markOpenedInApp();
          onLeave(recipe.id);
        }}
        {...{ [RECIPE_ROW_ATTRIBUTE]: recipe.id }}
        className={`flex min-h-14 items-center gap-3 py-3 hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-base font-medium break-words text-ink">{recipe.name}</span>
          <span className="mt-0.5 block text-sm text-ink-muted">{meta.serves(recipe)}</span>
          <RecipeFiguresLine recipe={recipe} />
          {lastOn !== undefined && (
            <span data-recipe-last-on="" className="mt-1 block text-sm text-ink-muted">
              {lastOn}
            </span>
          )}
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center text-accent">
          {recipe.favourite && (
            <>
              <Icon name="star" filled className="size-5" />
              <span className="sr-only">{t("favourite")}</span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}
