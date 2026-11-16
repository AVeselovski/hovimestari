"use client";

import { btnPrimary, btnSecondary, fieldHintClass, noticeClass, sectionTitle } from "@/components/ui/styles";
import { favouriteFoodsQuery, foodSearchQuery, ownFoodsQuery } from "@/lib/queryOptions";
import type { FoodList, FoodSummary } from "@hovimestari/types";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { FoodRow } from "./FoodRow";

// ---------------------------------------------------------------------------
// The food sheet's search view, below its pinned search field. With fewer
// than two characters typed it browses: the favourites, the user's own foods
// and a button to add one. It keeps browsing until typing has settled on two
// characters or more and the first answer is in, and goes back to browsing
// the moment the text drops under two, so the list is never blank in
// between. Then it shows the
// results of the last settled query, and keeps them on screen while the next
// one loads, so the list never flashes empty. A query no food matches offers
// to add it as the user's own food, both lines naming the settled text.
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
}

export function FoodSearchView({ query, settled, onOpen, onAddOwn, notice }: FoodSearchViewProps): ReactElement {
  const searching = query.length >= MIN_QUERY_LENGTH && settled.length >= MIN_QUERY_LENGTH;
  const search = useQuery({ ...foodSearchQuery(settled), enabled: searching });
  // The first answer for a search is on its way: the lists stay until it lands.
  const firstLoad = search.data === undefined && search.fetchStatus === "fetching";
  return (
    <div>
      {notice && (
        <p role="status" className={`${noticeClass} mb-4`}>
          {notice}
        </p>
      )}
      {!searching || firstLoad ? (
        <Browse onOpen={onOpen} onAddOwn={onAddOwn} />
      ) : (
        <Results settled={settled} search={search} onOpen={onOpen} onAddOwn={onAddOwn} />
      )}
    </div>
  );
}

function Browse({ onOpen, onAddOwn }: Pick<FoodSearchViewProps, "onOpen" | "onAddOwn">): ReactElement {
  const t = useTranslations("foods.sheet");
  const favourites = useQuery(favouriteFoodsQuery());
  const own = useQuery(ownFoodsQuery());
  // Neither list could be read and none is held: say so once, not twice.
  const unavailable =
    !favourites.data && !own.data && (favourites.isError || own.isError || favourites.fetchStatus === "paused");
  return (
    <div className="space-y-6">
      {unavailable ? (
        <p className={fieldHintClass}>{t("listsUnavailable")}</p>
      ) : (
        <>
          <FoodList
            title={t("favourites")}
            empty={t("favouritesEmpty")}
            foods={favourites.data?.foods}
            onOpen={onOpen}
          />
          <FoodList title={t("ownFoods")} empty={t("ownFoodsEmpty")} foods={own.data?.foods} onOpen={onOpen} />
        </>
      )}
      <button type="button" onClick={(e) => onAddOwn("", e.currentTarget)} className={`${btnPrimary} w-full`}>
        {t("addOwn")}
      </button>
    </div>
  );
}

function FoodList({
  title,
  empty,
  foods,
  onOpen,
}: {
  title: string;
  empty: string;
  /** Undefined while the list loads. */
  foods: FoodSummary[] | undefined;
  onOpen: FoodSearchViewProps["onOpen"];
}): ReactElement {
  return (
    <section aria-label={title}>
      <h3 className={`${sectionTitle} mb-1`}>{title}</h3>
      {foods === undefined ? null : foods.length === 0 ? (
        <p className="py-3 text-base text-ink-muted">{empty}</p>
      ) : (
        <ul>
          {foods.map((food) => (
            <FoodRow key={food.id} food={food} onOpen={onOpen} />
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
}: Pick<FoodSearchViewProps, "settled" | "onOpen" | "onAddOwn"> & {
  search: UseQueryResult<FoodList>;
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
        <button
          type="button"
          onClick={(e) => onAddOwn(settled, e.currentTarget)}
          className={`${btnPrimary} h-auto! min-h-12 w-full py-2.5 text-center break-words`}
        >
          {t("addQuery", { query: settled })}
        </button>
      </div>
    );
  } else if (search.data && search.data.foods.length > 0) {
    body = (
      <ul aria-busy={search.isPlaceholderData || undefined}>
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
      {body}
    </>
  );
}
