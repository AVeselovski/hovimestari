"use client";

import { AgainButton } from "@/components/log/AgainButton";
import { foodAgainItem } from "@/components/log/againItems";
import { useAmountLabels } from "@/components/log/amountLabel";
import type { BrowseLogging } from "@/components/log/browseLogging";
import { CreateActions } from "@/components/log/CreateActions";
import { ListsGuard, useHeldList, useListsReady } from "@/components/log/heldList";
import { RecentList } from "@/components/log/RecentList";
import { MealRows, SavedMealList } from "@/components/log/SavedMealList";
import { btnSecondary, btnWide, fieldHintClass, sectionTitle } from "@/components/ui/styles";
import { favouriteFoodsQuery, ownFoodsQuery, recentsQuery } from "@/lib/queryOptions";
import type { FavouriteFood, FoodSummary, SavedMeal } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { FoodRow } from "./FoodRow";

// ---------------------------------------------------------------------------
// The log sheet's own content on its search view, which `useFoodFinder`
// shows around the food results (`FoodSheet` passes them in its slots):
//
// - `Browse`, with fewer than two characters typed: "New saved meal" and
//   "Add an estimate", the recent items, the favourites, the saved meals,
//   the user's own foods and a button to add one. A recent item, a saved
//   meal, and a favourite with a last amount, carries the "+" that logs it
//   again. The sheet's one primary action is its footer, so every button
//   here is a secondary one.
// - `MealResults`, the lead of the results: the saved meals that match,
//   filtered on the device, or, when none does, the lines that save the text
//   as a meal or add it as an estimate.
// - `FoodList`, one titled list of foods, which the ingredient picker's
//   browse lists reuse.
// ---------------------------------------------------------------------------

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

/** What browsing in the log sheet needs from it. */
export interface BrowseProps {
  onOpen: (food: FoodSummary, opener: HTMLElement) => void;
  /** Opens the own-food sheet, with a name to start from. */
  onAddOwn: (name: string, opener: HTMLElement) => void;
  /** What browsing needs to log an item again and to open it with its last amount. */
  logging: BrowseLogging;
  meals: MealBrowsing;
}

export function Browse({ onOpen, onAddOwn, logging, meals }: BrowseProps): ReactElement {
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

export function FoodList<F extends FoodSummary>({
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

/**
 * The saved meals that match the text, before the food results: every word
 * part of a meal's name or source, from the chosen source alone when one is.
 * Filtered on the device, from the list read once, so they follow every key
 * and show offline from what is cached. When none matches, the lines that
 * save the text as a meal or add it as an estimate, each opening its sheet
 * with the name filled in.
 */
export function MealResults({
  query,
  found,
  logging,
  meals,
}: {
  query: string;
  found: readonly SavedMeal[];
  logging: BrowseLogging;
  meals: MealBrowsing;
}): ReactElement {
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
