"use client";

import { Icon } from "@/components/Icon";
import {
  btnText,
  chip,
  chipOff,
  chipOn,
  chipRowEnd,
  chipRowPinnedEnd,
  chipRowScroller,
  fieldHintClass,
  listLine,
  listLineFrame,
} from "@/components/ui/styles";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { formatDayShort } from "@/lib/localDate";
import { recipesQuery } from "@/lib/queryOptions";
import {
  forgetListPlace,
  keepListPlace,
  scrollPageTo,
  scrollPageToTop,
  takeOpenedInApp,
  type ListPlace,
} from "@/lib/recipeNav";
import { filterRecipes, MAX_RECIPE_TAGS, sortRecipes, type RecipeSummary } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { RecipeFilterSheet } from "./RecipeFilterSheet";
import { boundCount, filterCount, NO_FILTER, type ListFilter } from "./recipeListFilter";
import { RECIPE_ROW_ATTRIBUTE, RecipeRow } from "./RecipeRow";
import { sameTag, tagsInUse } from "./tags";

// ---------------------------------------------------------------------------
// RecipeList: the Recipes tab's recipes segment, under its action and its
// search field. A row of chips, Favourites and each tag the recipes use in
// Finnish order, narrows the list: every chip chosen must hold. The row ends
// in Filter, which keeps its place at the row's end, one width with and
// without its count, while the chips before it scroll on a phone and wrap
// from `md`. It opens the filter sheet (`RecipeFilterSheet`): the order
// of the list and bounds on a serving's protein and calories. While a bound
// or an order other than by name is in force, Filter reads "Filter · 2", the
// count of them, and is drawn as chosen. The chip row is drawn from the first
// frame, Favourites and Filter at least, so the tags joining it as the list
// answers move nothing under it. Then the recipes, filtered and sorted on the
// device with the shared `filterRecipes` and `sortRecipes` as each key is
// typed, then Archived recipes, by name, opened in place and read on its
// first open. In the order of the latest day, a row says that day.
//
// A row pressed keeps the list as it is for the way back: the search, the
// chips, the order and the bounds, whether Archived recipes is open, the
// scroll and the row (lib/recipeNav.ts). Back from the recipe, the list
// opens on all of it (`arrival`), with focus on that row. After a delete the
// row named takes focus and is brought into view, in the middle of the page,
// clear of the title above and the tab bar below. A kept place's scroll and
// focus are used only when the recipes are there as the list first shows. A
// list that answers later keeps its search, chips and filter and opens at
// its top, so nothing is taken from a person already typing.
//
// While the list loads it keeps one line's room. An empty list, a list that
// cannot be read and a search that matches none each say so in a line, the
// last with Clear search and filters, which also puts the order back to by
// name, as the filter sheet's Clear does.
// ---------------------------------------------------------------------------

export interface RecipeListProps {
  /** What the search field holds. */
  query: string;
  /** Empties the search field. */
  onClearQuery: () => void;
  /** New recipe, which takes focus after the last recipe is deleted. Read when the focus moves, not at render. */
  newRecipe: RefObject<HTMLElement | null>;
  /** How the tab was reached, when that asks something of the list. Read as the list mounts. */
  arrival: ListArrival | null;
}

/** What the list does as it first shows. */
export interface ListArrival {
  /** The list as a row left it, on the way back from that recipe. */
  place: ListPlace | null;
  /** After a delete on a recipe's page: the recipe whose row takes focus, or "new" for New recipe. */
  focus: string | null;
}

/** The most tag chips chosen at once: `tags` in a recipe filter takes at most this many (`RecipeFilterSchema`). */
const CHOSEN_LIMIT = MAX_RECIPE_TAGS;

export function RecipeList({ query, onClearQuery, newRecipe, arrival }: RecipeListProps): ReactElement {
  const t = useTranslations("recipes.list");
  const id = useId();
  const active = useQuery(recipesQuery(false));
  const recipes = active.data?.recipes;
  const unavailable = recipes === undefined && (active.isError || active.fetchStatus === "paused");
  // After a delete on a recipe's page, the row it named takes focus once the list is on screen, else New recipe.
  // Back from a recipe's page: the list where the row left it, with focus on that row.
  const [{ place, focus: focusTarget }] = useState<ListArrival>(arrival ?? { place: null, focus: null });
  const [favourites, setFavourites] = useState(place?.favourites ?? false);
  const [tags, setTags] = useState<string[]>(place?.tags ?? []);
  const [archivedOpen, setArchivedOpen] = useState(place?.archivedOpen ?? false);
  const [filter, setFilter] = useState<ListFilter>({ sort: place?.sort ?? "name", bounds: place?.bounds ?? {} });
  const filterSheet = useSheetTarget();
  const { today } = useToday();
  const rootRef = useRef<HTMLDivElement>(null);

  // A kept place is used only when the recipes are there as the list first shows.
  const [placeInTime] = useState(recipes !== undefined);
  useLayoutEffect(() => {
    if (place === null || placeInTime) return;
    // Let go unused: the list opens at its top, and takes neither the scroll nor the focus when it answers.
    forgetListPlace();
    scrollPageToTop();
    // Once, as the list mounts.
  }, []);

  const placed = useRef(false);
  useLayoutEffect(() => {
    if (placed.current || recipes === undefined) return;
    placed.current = true;
    // The place has served its way back, and a press that never reached a recipe's page is forgotten.
    forgetListPlace();
    takeOpenedInApp();
    const rowOf = (id: string): HTMLElement | null =>
      rootRef.current?.querySelector<HTMLElement>(`[${RECIPE_ROW_ATTRIBUTE}="${CSS.escape(id)}"]`) ?? null;
    if (focusTarget !== null) {
      const target = rowOf(focusTarget) ?? newRecipe.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center" });
    } else if (place !== null && placeInTime) {
      scrollPageTo(place.top);
      rowOf(place.rowId)?.focus({ preventScroll: true });
    }
  }, [focusTarget, place, placeInTime, recipes, newRecipe]);

  /** A row is leaving for its recipe: the list as it is stays with this history entry. */
  const leave = (rowId: string): void =>
    keepListPlace({ query, favourites, tags, sort: filter.sort, bounds: filter.bounds, archivedOpen, rowId });

  const usedTags = tagsInUse(recipes ?? []);
  // A chosen tag stays a chip while chosen, also once no recipe holds it any more.
  const tagChips = [...usedTags, ...tags.filter((tag) => !usedTags.some((u) => sameTag(u, tag)))];
  const narrowed = favourites || tags.length > 0 || boundCount(filter.bounds) > 0;
  const inForce = filterCount(filter);
  const shown =
    recipes === undefined
      ? undefined
      : sortRecipes(
          filterRecipes(recipes, {
            archived: false,
            q: query,
            tags: tags.length > 0 ? tags : undefined,
            favourites: favourites || undefined,
            ...filter.bounds,
          }),
          filter.sort,
        );
  /** The row's third line while the list is in the order of the latest day. */
  const lastOn = (recipe: RecipeSummary): string | undefined =>
    filter.sort !== "lastPutOn"
      ? undefined
      : recipe.lastPutOn === null
        ? t("notOnDay")
        : t("onDay", { date: formatDayShort(recipe.lastPutOn, undefined, today ?? undefined) });

  function clearAll(): void {
    setFavourites(false);
    setTags([]);
    // By name with no bound, as the filter sheet's Clear leaves it, so Filter reads plain after either.
    setFilter(NO_FILTER);
    onClearQuery();
  }

  return (
    <div ref={rootRef} data-recipe-list="">
      <div data-recipe-chips="" className={`${chipRowPinnedEnd} mb-4`}>
        {/* The group holds the chips that narrow the list. Filter opens a dialog, so it stands outside it. */}
        <div role="group" aria-label={t("chips")} className={chipRowScroller}>
          <button
            type="button"
            aria-pressed={favourites}
            onClick={() => setFavourites((on) => !on)}
            className={`${chip} ${favourites ? chipOn : chipOff}`}
          >
            {t("favourites")}
          </button>
          {tagChips.map((tag) => {
            const on = tags.some((chosen) => sameTag(chosen, tag));
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setTags((chosen) =>
                    on
                      ? chosen.filter((x) => !sameTag(x, tag))
                      : chosen.length < CHOSEN_LIMIT
                        ? [...chosen, tag]
                        : chosen,
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
        <button
          type="button"
          aria-haspopup="dialog"
          data-recipe-filter=""
          onClick={(e) => filterSheet.open(e.currentTarget)}
          className={`${chip} ${chipRowEnd} ${inForce > 0 ? chipOn : chipOff}`}
        >
          {inForce > 0 ? (
            <>
              <span aria-hidden="true">{t("filterCount", { count: inForce })}</span>
              <span className="sr-only">{t("filterSaid", { count: inForce })}</span>
            </>
          ) : (
            t("filter")
          )}
        </button>
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
              <RecipeRow key={recipe.id} recipe={recipe} onLeave={leave} lastOn={lastOn(recipe)} />
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
      <div id={`${id}-archived`}>{archivedOpen && <ArchivedRecipes query={query} onLeave={leave} />}</div>
      {filterSheet.shown && (
        <RecipeFilterSheet
          key={filterSheet.shown.key}
          open={filterSheet.isOpen}
          returnFocusTo={filterSheet.shown.opener}
          onClose={filterSheet.close}
          filter={filter}
          onApply={setFilter}
        />
      )}
    </div>
  );
}

/** The archived recipes, by name, read when first opened, filtered by the same search. */
function ArchivedRecipes({ query, onLeave }: { query: string; onLeave: (recipeId: string) => void }): ReactElement {
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
            <RecipeRow key={recipe.id} recipe={recipe} onLeave={onLeave} />
          ))}
        </ul>
      )}
    </section>
  );
}
