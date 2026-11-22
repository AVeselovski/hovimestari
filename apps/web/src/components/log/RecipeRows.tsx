"use client";

import { Icon } from "@/components/Icon";
import { RecipeFiguresLine } from "@/components/recipes/RecipeFiguresLine";
import { btnText, fieldHintClass, focusRing, sectionTitle } from "@/components/ui/styles";
import { recipesQuery } from "@/lib/queryOptions";
import { sortRecipes, type RecipeSummary } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, type ReactElement, type ReactNode } from "react";
import { AgainButton } from "./AgainButton";
import { recipeAgainItem } from "./againItems";
import { useAmountLabels } from "./amountLabel";
import type { BrowseLogging } from "./browseLogging";
import { useHeldList, useListsReady } from "./heldList";

// ---------------------------------------------------------------------------
// A recipe in the log sheet's lists.
//
// - `LogRecipeRow`: one recipe, a button that opens its recipe view. Built
//   like a food row: at least 56 px tall, the name wrapping rather than
//   running out of the row, one line under it, and a `trailing` control
//   beside the button inside the same `<li>`, the "+" that logs it. A
//   favourite's star sits at the end of the name's line, and every row keeps
//   that column, so a star never narrows a name. The line under the name
//   runs the button's whole width, under the star's column too, so a
//   serving's figures have room at 320 px.
// - `RecipeRows`: recipe rows with one serving's figures and a "+" that logs
//   the last servings, else 1 serving. The search results show them.
// - `RecipeBrowseList`: the log sheet's "Recipes" while browsing: the active
//   recipes, favourites first and then by name, five at most
//   (`RECIPES_SHOWN`). With more, the section ends in one button, "All 30
//   recipes", which shows the rest in place under the five, in the same
//   order, and moves focus to the first row it revealed. The sheet keeps
//   that choice for one open (`RecipeBrowsing`), so the list is as the
//   person left it back from a view or a search, and five again at the next
//   open. Typed text finds every recipe. While the list loads only its title
//   shows. The Day tab reads it ahead, so the sheet normally opens with it.
//   Its order holds while it can be pressed (heldList.tsx), and the five are
//   the first five of that held order, so a read that lands moves none.
// ---------------------------------------------------------------------------

/** The attribute a recipe row's button carries, so focus can find it again after the recipe view closes. */
export const LOG_RECIPE_ROW_ATTRIBUTE = "data-log-recipe-row";

export interface LogRecipeRowProps {
  recipe: RecipeSummary;
  onOpen: (recipe: RecipeSummary, opener: HTMLElement) => void;
  /** The line under the name: "Last 1 serving", or the figures of one serving. */
  meta: ReactNode;
  trailing?: ReactNode;
}

export function LogRecipeRow({ recipe, onOpen, meta, trailing }: LogRecipeRowProps): ReactElement {
  const t = useTranslations("recipes.list");
  return (
    <li className="flex items-center gap-2 border-b border-rule last:border-b-0">
      <button
        type="button"
        {...{ [LOG_RECIPE_ROW_ATTRIBUTE]: recipe.id }}
        onClick={(e) => onOpen(recipe, e.currentTarget)}
        className={`flex min-h-14 min-w-0 flex-1 flex-col justify-center py-3 text-left hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
      >
        <span className="flex items-start gap-3">
          <span className="block min-w-0 flex-1 text-base font-medium break-words text-ink">{recipe.name}</span>
          <span data-recipe-star="" className="flex shrink-0 pt-0.5">
            <span className={`size-5 text-accent${recipe.favourite ? "" : " invisible"}`}>
              {recipe.favourite && (
                <>
                  <Icon name="star" filled className="size-5" />
                  <span className="sr-only">{t("favourite")}</span>
                </>
              )}
            </span>
          </span>
        </span>
        {meta}
      </button>
      {trailing}
    </li>
  );
}

/** Recipe rows, each with one serving's figures and a "+" that logs its last servings, else 1 serving. */
export function RecipeRows({
  recipes,
  logging,
}: {
  recipes: readonly RecipeSummary[];
  logging: BrowseLogging;
}): ReactElement {
  const labels = useAmountLabels();
  return (
    <ul>
      {recipes.map((recipe) => (
        <LogRecipeRow
          key={recipe.id}
          recipe={recipe}
          meta={<RecipeFiguresLine recipe={recipe} />}
          onOpen={(r, opener) => logging.onOpenRecipe(r, opener, r.lastServings)}
          trailing={<AgainButton item={recipeAgainItem(recipe, recipe.lastServings, labels)} logging={logging} />}
        />
      ))}
    </ul>
  );
}

/** The most recipes the browse list shows before "All 30 recipes" is pressed. */
export const RECIPES_SHOWN = 5;

/** Whether the browse list shows all of its recipes. The sheet keeps it for one open. */
export interface RecipeBrowsing {
  all: boolean;
  onShowAll: () => void;
}

/** The browse list's order: favourites first, then the rest, each by name. */
function favouritesFirst(recipes: readonly RecipeSummary[]): RecipeSummary[] {
  const byName = sortRecipes(recipes, "name");
  return [...byName.filter((recipe) => recipe.favourite), ...byName.filter((recipe) => !recipe.favourite)];
}

export function RecipeBrowseList({
  logging,
  sayUnavailable,
  browsing,
}: {
  logging: BrowseLogging;
  /** The list cannot be read and nothing else says so already: say it here. */
  sayUnavailable: boolean;
  browsing: RecipeBrowsing;
}): ReactElement {
  const t = useTranslations("log.browse");
  const tList = useTranslations("recipes.list");
  const query = useQuery(recipesQuery(false));
  // Whatever order a write left the cached list in. One array per answer, so the held list can tell a change.
  const ordered = useMemo(() => (query.data ? favouritesFirst(query.data.recipes) : undefined), [query.data]);
  // The order this list showed holds while it can be pressed (heldList.tsx).
  const recipes = useHeldList(ordered, (recipe) => recipe.id);
  // Its line waits for the other lists, as its rows do.
  const unavailable = useListsReady() && recipes === undefined && (query.isError || query.fetchStatus === "paused");
  const capped = recipes !== undefined && recipes.length > RECIPES_SHOWN && !browsing.all;

  // The press on "All 30 recipes" takes its button away: focus goes to the first row it revealed, at the
  // button's own place, so nothing scrolls.
  const sectionRef = useRef<HTMLElement>(null);
  const revealing = useRef(false);
  useLayoutEffect(() => {
    if (!browsing.all || !revealing.current) return;
    revealing.current = false;
    sectionRef.current
      ?.querySelectorAll<HTMLElement>(`[${LOG_RECIPE_ROW_ATTRIBUTE}]`)
      [RECIPES_SHOWN]?.focus({ preventScroll: true });
  }, [browsing.all]);

  return (
    <section ref={sectionRef} aria-label={t("recipes")} data-list="recipes">
      <h3 className={`${sectionTitle} mb-1`}>{t("recipes")}</h3>
      {recipes === undefined ? (
        unavailable && sayUnavailable && <p className={fieldHintClass}>{tList("unavailable")}</p>
      ) : recipes.length === 0 ? (
        <p className="py-3 text-base text-ink-muted">{tList("empty")}</p>
      ) : (
        <RecipeRows recipes={capped ? recipes.slice(0, RECIPES_SHOWN) : recipes} logging={logging} />
      )}
      {capped && (
        <button
          type="button"
          data-all-recipes=""
          onClick={() => {
            revealing.current = true;
            browsing.onShowAll();
          }}
          className={`${btnText} mt-1 w-full`}
        >
          {t("allRecipes", { count: recipes.length })}
        </button>
      )}
    </section>
  );
}
