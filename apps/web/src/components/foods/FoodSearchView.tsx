"use client";

import { AgainButton } from "@/components/log/AgainButton";
import { foodAgainItem } from "@/components/log/againItems";
import { useAmountLabels } from "@/components/log/amountLabel";
import type { BrowseLogging } from "@/components/log/browseLogging";
import { CreateActions } from "@/components/log/CreateActions";
import { ListsGuard, useHeldList, useListsReady } from "@/components/log/heldList";
import { activeSource, mealFilter } from "@/components/log/mealFilter";
import { RecentList } from "@/components/log/RecentList";
import { MealRows, SavedMealList } from "@/components/log/SavedMealList";
import { btnSecondary, btnWide, fieldHintClass, noticeClass, sectionTitle } from "@/components/ui/styles";
import { barcodeOf } from "@/lib/barcode";
import { favouriteFoodsQuery, foodSearchQuery, ownFoodsQuery, recentsQuery, savedMealsQuery } from "@/lib/queryOptions";
import type { FavouriteFood, FoodList, FoodSummary, SavedMeal } from "@hovimestari/types";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, type ReactElement } from "react";
import { FoodRow } from "./FoodRow";

// ---------------------------------------------------------------------------
// The log sheet's search view, below its pinned search field. With fewer
// than two characters typed it browses: "New saved meal" and "Add an
// estimate", the recent items, the favourites, the saved meals, the user's
// own foods and a button to add one. A recent item, a saved meal, and a
// favourite with a last amount, carries the "+" that logs it again. The
// sheet's one primary action is its footer, so every button here is a
// secondary one. The results start with the saved meals that match, filtered
// on the device, or, when none does, the lines that save the text as a meal
// or add it as an estimate. It keeps browsing until typing has settled on two
// characters or more and the first answer is in, and goes back to browsing
// the moment the text drops under two, so the list is never blank in
// between. Then it shows the
// results of the last settled query, and keeps them on screen while the next
// one loads, so the list never flashes empty. A query no food matches offers
// to add it as the user's own food, both lines naming the settled text.
//
// Text that names a barcode (8 to 14 digits) puts the view in barcode mode:
// no search is sent, not even for the barcode's text once the field leaves
// it, and no saved meal shows, and the sheet's barcode block
// (`BarcodeResult`) stands in place of the lists and results. Leaving it
// brings the search back.
//
// When the results replace the lists, and when the text changes, the sheet's
// body goes to its top, so the best matches are the first thing in view.
// Back from a food or a meal mounts the view again where it was left, and
// moves nothing here: `useSheetNavigation` puts its scroll back.
// ---------------------------------------------------------------------------

/** The fewest characters a search is sent for. The server drops shorter words anyway. */
export const MIN_QUERY_LENGTH = 2;

export interface FoodSearchViewProps {
  /** What the field holds, trimmed. */
  query: string;
  /** The query once typing has settled, trimmed. The request is keyed by it. */
  settled: string;
  onOpen: (food: FoodSummary, opener: HTMLElement) => void;
  /** Opens the own-food sheet, with a name to start from. */
  onAddOwn: (name: string, opener: HTMLElement) => void;
  /** A line above everything, such as "This food is no longer available." */
  notice: string | null;
  /** What browsing needs to log an item again and to open it with its last amount. */
  logging: BrowseLogging;
  meals: MealBrowsing;
  /** The barcode block, when the text names a barcode. It replaces the lists and the results. */
  barcode: ReactElement | null;
}

/** What the saved meals in browsing and in the results need from the sheet. */
export interface MealBrowsing {
  /** The source chip chosen, or null for all. */
  source: string | null;
  onSource: (source: string | null) => void;
  /** Opens the saved meal sheet, with a name to start from. */
  onNewMeal: (name: string, opener: HTMLElement) => void;
  /** Opens the estimate sheet, with a name to start from. */
  onEstimate: (name: string, opener: HTMLElement) => void;
  onArchived: (opener: HTMLElement) => void;
}

export function FoodSearchView({
  query,
  settled,
  onOpen,
  onAddOwn,
  notice,
  logging,
  meals,
  barcode,
}: FoodSearchViewProps): ReactElement {
  // A barcode is never searched as a name, also while the debounced text still holds one the field has left.
  const searching =
    barcode === null &&
    barcodeOf(settled) === null &&
    query.length >= MIN_QUERY_LENGTH &&
    settled.length >= MIN_QUERY_LENGTH;
  const search = useQuery({ ...foodSearchQuery(settled), enabled: searching });
  // The first answer for a search is on its way: the lists stay until it lands.
  const firstLoad = search.data === undefined && search.fetchStatus === "fetching";
  const allMeals = useQuery(savedMealsQuery(false)).data?.meals ?? [];
  const found = mealFilter(allMeals, query, activeSource(allMeals, meals.source));
  const tResults = useTranslations("log.results");
  const showsResults = searching && !firstLoad;
  const rootRef = useRef<HTMLDivElement>(null);
  // On a mount too, where it changes nothing: Back from a view mounts this
  // again, and `useSheetNavigation`'s layout effect, the parent's, runs after
  // this one and puts the scroll back where it was left.
  useLayoutEffect(() => {
    const body = rootRef.current?.closest<HTMLElement>("[data-sheet-body]");
    if (body) body.scrollTop = 0;
  }, [query, showsResults]);
  return (
    <div ref={rootRef}>
      {notice && (
        <p role="status" className={`${noticeClass} mb-4`}>
          {notice}
        </p>
      )}
      {barcode !== null ? (
        barcode
      ) : !showsResults ? (
        <Browse onOpen={onOpen} onAddOwn={onAddOwn} logging={logging} meals={meals} />
      ) : (
        <>
          <MealResults query={query} found={found} logging={logging} meals={meals} />
          {/* Under the saved meals, the foods have a heading of their own, so the two read as two. */}
          <Results
            settled={settled}
            search={search}
            onOpen={onOpen}
            onAddOwn={onAddOwn}
            title={found.length > 0 ? tResults("foods") : undefined}
          />
        </>
      )}
    </div>
  );
}

function Browse({
  onOpen,
  onAddOwn,
  logging,
  meals,
}: Pick<FoodSearchViewProps, "onOpen" | "onAddOwn" | "logging" | "meals">): ReactElement {
  const t = useTranslations("foods.sheet");
  const tBrowse = useTranslations("log.browse");
  const labels = useAmountLabels();
  const favourites = useQuery(favouriteFoodsQuery());
  const own = useQuery(ownFoodsQuery());
  // When the recent items cannot be read either, their line already names the saved meals.
  const recents = useQuery(recentsQuery());
  const recentsUnavailable = !recents.data && (recents.isError || recents.fetchStatus === "paused");
  // Neither list could be read and none is held: say so once, not twice, with the other lists.
  const unavailable =
    useListsReady() &&
    !favourites.data &&
    !own.data &&
    (favourites.isError || own.isError || favourites.fetchStatus === "paused");
  return (
    <div className="space-y-6">
      <CreateActions
        onNewMeal={(opener) => meals.onNewMeal("", opener)}
        onEstimate={(opener) => meals.onEstimate("", opener)}
      />
      {/* The lists show their rows together, and a press waits until they are in place (heldList.tsx). */}
      <ListsGuard className="space-y-6">
        <RecentList logging={logging} />
        {unavailable ? (
          <p className={fieldHintClass}>{t("listsUnavailable")}</p>
        ) : (
          <>
            <FoodList
              list="favourites"
              title={t("favourites")}
              empty={t("favouritesEmpty")}
              foods={favourites.data?.foods}
              onOpen={(food, opener) => logging.onOpenFood(food, opener, food.lastAmount)}
              rowExtras={(food: FavouriteFood) => {
                if (food.lastAmount === null) return {};
                const again = foodAgainItem(food, food.lastAmount, labels);
                return {
                  meta: tBrowse("last", { amount: again.amount }),
                  trailing: <AgainButton item={again} logging={logging} />,
                };
              }}
            />
          </>
        )}
        <SavedMealList
          logging={logging}
          source={meals.source}
          onSource={meals.onSource}
          onArchived={meals.onArchived}
          sayUnavailable={!recentsUnavailable}
        />
        {!unavailable && (
          <FoodList
            list="own"
            title={t("ownFoods")}
            empty={t("ownFoodsEmpty")}
            foods={own.data?.foods}
            onOpen={onOpen}
          />
        )}
        <button type="button" onClick={(e) => onAddOwn("", e.currentTarget)} className={`${btnSecondary} w-full`}>
          {t("addOwn")}
        </button>
      </ListsGuard>
    </div>
  );
}

function FoodList<F extends FoodSummary>({
  list,
  title,
  empty,
  foods,
  onOpen,
  rowExtras,
}: {
  /** The list's name, so focus can find the row opened from it among the others. */
  list: string;
  title: string;
  empty: string;
  /** Undefined while the list loads. */
  foods: F[] | undefined;
  onOpen: (food: F, opener: HTMLElement) => void;
  /** A row's meta line and trailing control, if any. */
  rowExtras?: (food: F) => { meta?: string; trailing?: ReactElement };
}): ReactElement {
  // The order this list showed holds while it can be pressed (heldList.tsx).
  const rows = useHeldList(foods, (food) => food.id);
  return (
    <section aria-label={title} data-list={list}>
      <h3 className={`${sectionTitle} mb-1`}>{title}</h3>
      {rows === undefined ? null : rows.length === 0 ? (
        <p className="py-3 text-base text-ink-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((food) => (
            <FoodRow key={food.id} food={food} onOpen={(_row, opener) => onOpen(food, opener)} {...rowExtras?.(food)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Results({
  settled,
  search,
  onOpen,
  onAddOwn,
  title,
}: Pick<FoodSearchViewProps, "settled" | "onOpen" | "onAddOwn"> & {
  search: UseQueryResult<FoodList>;
  /** A heading over the foods, when saved meals show above them. */
  title?: string;
}): ReactElement {
  const t = useTranslations("foods.sheet");
  const waiting = search.isPlaceholderData || search.data === undefined;
  const offline = search.fetchStatus === "paused" && waiting;
  const failed = search.isError && search.data === undefined;
  const settledFoods = search.isPlaceholderData ? undefined : search.data?.foods;

  let body: ReactElement | null = null;
  if (offline) {
    body = <p className="py-3 text-base text-ink">{t("offline")}</p>;
  } else if (failed) {
    body = (
      <div className="flex flex-col items-start gap-3 py-3">
        <p className="text-base text-ink">{t("failed")}</p>
        <button type="button" onClick={() => void search.refetch()} className={btnSecondary}>
          {t("tryAgain")}
        </button>
      </div>
    );
  } else if (settledFoods && settledFoods.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-4 py-3">
        <p className="text-base break-words text-ink">{t("noResults", { query: settled })}</p>
        {/* A long query wraps rather than running out of the button. */}
        <button type="button" onClick={(e) => onAddOwn(settled, e.currentTarget)} className={btnWide}>
          {t("addQuery", { query: settled })}
        </button>
      </div>
    );
  } else if (search.data && search.data.foods.length > 0) {
    body = (
      <ul data-list="results" aria-busy={search.isPlaceholderData || undefined}>
        {search.data.foods.map((food) => (
          <FoodRow key={food.id} food={food} onOpen={onOpen} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {settledFoods ? t("resultCount", { count: settledFoods.length }) : ""}
      </p>
      {title !== undefined && body !== null ? (
        <section aria-label={title} data-list="food-results">
          <h3 className={`${sectionTitle} mb-1`}>{title}</h3>
          {body}
        </section>
      ) : (
        body
      )}
    </>
  );
}

/**
 * The saved meals that match the text, before the food results: every word
 * part of a meal's name or source, from the chosen source alone when one is.
 * Filtered on the device, from the list read once, so they follow every key
 * and show offline from what is cached. When none matches, the lines that
 * save the text as a meal or add it as an estimate, each opening its sheet
 * with the name filled in.
 */
function MealResults({
  query,
  found,
  logging,
  meals,
}: Pick<FoodSearchViewProps, "query" | "logging" | "meals"> & { found: readonly SavedMeal[] }): ReactElement {
  const t = useTranslations("log.results");
  const tBrowse = useTranslations("log.browse");
  return (
    <div className="mb-6">
      <p aria-live="polite" className="sr-only">
        {found.length > 0 ? t("mealCount", { count: found.length }) : ""}
      </p>
      {found.length > 0 ? (
        <section aria-label={tBrowse("savedMeals")} data-list="meal-results">
          <h3 className={`${sectionTitle} mb-1`}>{tBrowse("savedMeals")}</h3>
          <MealRows meals={found} logging={logging} />
        </section>
      ) : (
        <div data-create-from-query="" className="flex flex-col gap-2">
          <button type="button" onClick={(e) => meals.onNewMeal(query, e.currentTarget)} className={btnWide}>
            {t("saveAsMeal", { query })}
          </button>
          <button type="button" onClick={(e) => meals.onEstimate(query, e.currentTarget)} className={btnWide}>
            {t("addAsEstimate", { query })}
          </button>
        </div>
      )}
    </div>
  );
}
