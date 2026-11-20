"use client";

import { Icon } from "@/components/Icon";
import {
  btnText,
  chip,
  chipOff,
  chipOn,
  fieldHintClass,
  listLine,
  listLineFrame,
  sheetChipRowWrapping,
} from "@/components/ui/styles";
import { recipesQuery } from "@/lib/queryOptions";
import { restoreListScroll, takeFocusAfterDelete } from "@/lib/recipeNav";
import { filterRecipes, fold, sortRecipes, type RecipeSummary } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { RECIPE_ROW_ATTRIBUTE, RecipeRow } from "./RecipeRow";

// ---------------------------------------------------------------------------
// RecipeList: the Recipes tab's recipes segment, under its action and its
// search field. A row of chips, Favourites and each tag the recipes use in
// Finnish order, narrows the list: every chip chosen must hold. The chip
// row is drawn from the first frame, Favourites at least, so the tags joining
// it as the list answers move nothing under it. Then the recipes by name,
// filtered on the device with the shared `filterRecipes` as each key is
// typed, then Archived recipes, opened in place and read on its first open.
//
// While the list loads it keeps one line's room. An empty list, a list that
// cannot be read and a search that matches none each say so in a line, the
// last with Clear search and filters.
// ---------------------------------------------------------------------------

export interface RecipeListProps {
  /** What the search field holds. */
  query: string;
  /** Empties the search field. */
  onClearQuery: () => void;
  /** New recipe, which takes focus after the last recipe is deleted. */
  newRecipe: HTMLElement | null;
}

const CHOSEN_LIMIT = 10;

export function RecipeList({ query, onClearQuery, newRecipe }: RecipeListProps): ReactElement {
  const t = useTranslations("recipes.list");
  const id = useId();
  const active = useQuery(recipesQuery(false));
  const recipes = active.data?.recipes;
  const unavailable = recipes === undefined && (active.isError || active.fetchStatus === "paused");
  const [favourites, setFavourites] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // After a delete on a recipe's page, the row it named takes focus once the list is on screen.
  const [focusTarget] = useState(takeFocusAfterDelete);
  const focused = useRef(false);
  // Back from a recipe's page: the list where the row left it, once its rows are on screen.
  useLayoutEffect(() => {
    if (recipes !== undefined) restoreListScroll();
  }, [recipes]);
  useLayoutEffect(() => {
    if (focusTarget === null || focused.current || recipes === undefined) return;
    focused.current = true;
    const row = rootRef.current?.querySelector<HTMLElement>(`[${RECIPE_ROW_ATTRIBUTE}="${CSS.escape(focusTarget)}"]`);
    (row ?? newRecipe)?.focus({ preventScroll: false });
  }, [focusTarget, recipes, newRecipe]);

  // Each tag once, folded, in the spelling of the first recipe by name that has it.
  const spelled = new Map<string, string>();
  for (const recipe of sortRecipes(recipes ?? [], "name")) {
    for (const tag of recipe.tags) if (!spelled.has(fold(tag))) spelled.set(fold(tag), tag);
  }
  const usedTags = [...spelled.values()].sort((a, b) => a.localeCompare(b, "fi"));
  // A chosen tag stays a chip while chosen, also once no recipe holds it any more.
  const tagChips = [...usedTags, ...tags.filter((tag) => !usedTags.some((u) => fold(u) === fold(tag)))];
  const narrowed = favourites || tags.length > 0;
  const shown =
    recipes === undefined
      ? undefined
      : sortRecipes(
          filterRecipes(recipes, {
            archived: false,
            q: query,
            tags: tags.length > 0 ? tags : undefined,
            favourites: favourites || undefined,
          }),
          "name",
        );

  function clearAll(): void {
    setFavourites(false);
    setTags([]);
    onClearQuery();
  }

  return (
    <div ref={rootRef} data-recipe-list="">
      <div role="group" aria-label={t("chips")} className={`${sheetChipRowWrapping} mb-4`}>
        <button
          type="button"
          aria-pressed={favourites}
          onClick={() => setFavourites((on) => !on)}
          className={`${chip} ${favourites ? chipOn : chipOff}`}
        >
          {t("favourites")}
        </button>
        {tagChips.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setTags((chosen) =>
                  on ? chosen.filter((x) => x !== tag) : chosen.length < CHOSEN_LIMIT ? [...chosen, tag] : chosen,
                )
              }
              title={tag}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <section aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="sr-only">
          {t("title")}
        </h2>
        <p aria-live="polite" className="sr-only">
          {shown !== undefined && (query.trim() !== "" || narrowed) ? t("count", { count: shown.length }) : ""}
        </p>
        {shown === undefined ? (
          <div className={listLineFrame}>{unavailable && <p className={fieldHintClass}>{t("unavailable")}</p>}</div>
        ) : recipes!.length === 0 ? (
          <p className={listLine}>{t("empty")}</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-start gap-1 py-3">
            <p className="text-base text-ink">{t("noMatch")}</p>
            <button type="button" onClick={clearAll} className={btnText}>
              {t("clear")}
            </button>
          </div>
        ) : (
          <ul data-list="recipes">
            {shown.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} />
            ))}
          </ul>
        )}
      </section>
      <button
        type="button"
        aria-expanded={archivedOpen}
        aria-controls={`${id}-archived`}
        onClick={() => setArchivedOpen((open) => !open)}
        className={`${btnText} mt-1 gap-1.5`}
      >
        {t("archived")}
        <Icon
          name="chevronDown"
          className={`size-5 shrink-0 transition-transform duration-150 motion-reduce:transition-none${archivedOpen ? " rotate-180" : ""}`}
        />
      </button>
      <div id={`${id}-archived`}>{archivedOpen && <ArchivedRecipes query={query} />}</div>
    </div>
  );
}

/** The archived recipes, by name, read when first opened, filtered by the same search. */
function ArchivedRecipes({ query }: { query: string }): ReactElement {
  const t = useTranslations("recipes.list");
  const archived = useQuery(recipesQuery(true));
  const recipes: RecipeSummary[] | undefined = archived.data?.recipes;
  const unavailable = recipes === undefined && (archived.isError || archived.fetchStatus === "paused");
  const shown =
    recipes === undefined ? undefined : sortRecipes(filterRecipes(recipes, { archived: true, q: query }), "name");
  return (
    <section aria-label={t("archived")} className="mt-1">
      <h3 className="sr-only">{t("archived")}</h3>
      {shown === undefined ? (
        <div className={listLineFrame}>{unavailable && <p className={fieldHintClass}>{t("unavailable")}</p>}</div>
      ) : recipes!.length === 0 ? (
        <p className={listLine}>{t("archivedEmpty")}</p>
      ) : shown.length === 0 ? (
        <p className={listLine}>{t("noMatch")}</p>
      ) : (
        <ul data-list="archived-recipes">
          {shown.map((recipe) => (
            <RecipeRow key={recipe.id} recipe={recipe} />
          ))}
        </ul>
      )}
    </section>
  );
}
