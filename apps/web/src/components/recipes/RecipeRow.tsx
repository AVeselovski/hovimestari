"use client";

import { MacroDot } from "@/components/figures/MacroDot";
import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { isPlainPress, markOpenedInApp } from "@/lib/recipeNav";
import type { RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";
import { useRecipeMeta } from "./useRecipeMeta";

// ---------------------------------------------------------------------------
// RecipeRow: one recipe in the Recipes tab's list, a link to its page, at
// least 56 pixels tall. Its name, two lines at most, then "Serves 2 · 25 min",
// then one serving's calories and protein, each figure after its dot in the
// macro's hue, in the monospaced face. The figures keep one line at every
// width, so rows with one-line names are all one height: on a phone the line
// reads "365 kcal" and "21.8 g protein", and from `md` it ends "per serving".
// Read aloud it always does. A favourite's star sits at the end, and every
// row keeps that place, so the names of a list line up.
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
}

export function RecipeRow({ recipe, onLeave }: RecipeRowProps): ReactElement {
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
          <span
            data-recipe-figures-line=""
            className="mt-1 flex items-center gap-x-2 font-mono text-sm whitespace-nowrap text-ink-muted tabular-nums"
          >
            <span className="sr-only">{meta.figures(recipe)}</span>
            <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1.5">
              <MacroDot macro="energy" />
              {t("kcal", { value: formatKcal(recipe.perServing.energyKcal) })}
            </span>
            <span aria-hidden="true" className="inline-flex min-w-0 items-center gap-1.5">
              <MacroDot macro="protein" />
              <span className="truncate">
                {t("protein", { value: formatMacroGrams(recipe.perServing.proteinG) })}
                <span className="max-md:hidden"> {t("perServing")}</span>
              </span>
            </span>
          </span>
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
