"use client";

import { Icon } from "@/components/Icon";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import { focusRing, inputClass } from "@/components/ui/styles";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { deleteFood } from "@/lib/api/foods";
import { getErrorCode } from "@/lib/errors";
import { afterFoodGone } from "@/lib/invalidation";
import { foodDetailQuery } from "@/lib/queryOptions";
import type { FoodDetail, FoodSummary, Portion } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { ADD_PORTION_ATTRIBUTE, FoodDetailBody, FoodDetailHeader } from "./FoodDetail";
import { FOOD_ROW_ATTRIBUTE } from "./FoodRow";
import { FoodSearchView } from "./FoodSearchView";
import { OwnFoodSheet } from "./OwnFoodSheet";
import { PortionSheet } from "./PortionSheet";
import { useFavourite } from "./useFavourite";

// ---------------------------------------------------------------------------
// FoodSheet: the food surface. One tall sheet with two views, because moving
// from a result to its detail and back is navigation, not a form:
//
// - Search: the search field pinned in the sheet's fixed header, and under it
//   the favourites and own foods, or the results of what is typed.
// - Detail: Back and the star in the header, the food's name and the food
//   below, scrolling.
//
// The sheet's height is fixed (`size="tall"`), so its top edge is the same in
// every view and state, and the search field never moves as results change.
// Back returns to the search with the query, the results and the scroll
// position as they were, and puts focus on the row that was opened.
//
// The forms (own food, portion) and the delete confirmation are sheets of
// their own, stacked on this one, so each keeps the form-sheet contract.
// ---------------------------------------------------------------------------

/** How long typing must pause before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 150;

export interface FoodSheetProps {
  open: boolean;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}

type View = { kind: "search" } | { kind: "detail"; food: FoodSummary };

/** The sheet's scrolling body, found from an element inside it. */
function bodyOf(ref: RefObject<HTMLElement | null>): HTMLElement | null {
  return ref.current?.closest<HTMLElement>("[data-sheet-body]") ?? null;
}

export function FoodSheet({ open, onClose, returnFocusTo }: FoodSheetProps): ReactElement {
  const t = useTranslations("foods.sheet");
  const tDetail = useTranslations("foods.detail");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const searchId = `${useId()}-search`;

  const [text, setText] = useState("");
  const query = text.trim();
  const settled = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [view, setView] = useState<View>({ kind: "search" });
  const [notice, setNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Where the search was scrolled to, and which row opened the detail.
  const searchScroll = useRef(0);
  const openedRow = useRef<string | null>(null);
  // Set by a view change: where focus goes once the new view has rendered.
  const pendingFocus = useRef<"back" | "row" | "search" | null>(null);

  const detailId = view.kind === "detail" ? view.food.id : null;
  const detail = useQuery({ ...foodDetailQuery(detailId ?? ""), enabled: detailId !== null });
  const favourite = useFavourite(detailId ?? "");

  const ownSheet = useSheetTarget<{ food?: FoodDetail; name: string }>();
  const portionSheet = useSheetTarget<{ foodId: string; portion?: Portion }>();

  function showSearch(focus: "row" | "search"): void {
    pendingFocus.current = focus;
    setView({ kind: "search" });
  }

  function showDetail(food: FoodSummary, fromRow: boolean): void {
    if (view.kind === "search") searchScroll.current = bodyOf(contentRef)?.scrollTop ?? 0;
    openedRow.current = fromRow ? food.id : null;
    pendingFocus.current = "back";
    setNotice(null);
    setView({ kind: "detail", food });
  }

  // Place the scroll and focus once the new view is on screen.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const body = bodyOf(contentRef);
    if (view.kind === "detail") {
      if (body) body.scrollTop = 0;
      backRef.current?.focus({ preventScroll: true });
      return;
    }
    if (target === "row") {
      if (body) body.scrollTop = searchScroll.current;
      const row = openedRow.current
        ? contentRef.current?.querySelector<HTMLElement>(`[${FOOD_ROW_ATTRIBUTE}="${CSS.escape(openedRow.current)}"]`)
        : null;
      (row ?? inputRef.current)?.focus({ preventScroll: true });
    } else {
      if (body) body.scrollTop = 0;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  /**
   * The open food is gone (deleted on another device, or no longer visible):
   * any sheet stacked on it closes, and the sheet returns to the search with
   * a line that says so. Its row is gone too, so focus goes to the field.
   */
  function foodGone(id: string): void {
    ownSheet.close();
    portionSheet.close();
    openedRow.current = null;
    setNotice(t("gone"));
    showSearch("search");
    void afterFoodGone(client, id);
  }

  const gone = detailId !== null && getErrorCode(detail.error) === "food_not_found";
  const favouriteGone = getErrorCode(favourite.error) === "food_not_found";
  useEffect(() => {
    if (detailId !== null && (gone || favouriteGone)) foodGone(detailId);
    // Runs when the food turns out to be gone, not on every render.
  }, [gone, favouriteGone]);

  const remove = useConfirmedDelete<FoodSummary>({
    copy: (food) => ({ title: tDetail("deleteTitle", { name: food.name }), message: tDetail("deleteBody") }),
    // Gone already, deleted on another device: what the user asked for is true.
    run: (food) =>
      deleteFood(food.id).catch((err: unknown) => {
        if (getErrorCode(err) !== "food_not_found") throw err;
      }),
    onDone: (_result, food) => afterDelete(food.id),
  });

  /** After the open food is deleted: the browse view, with focus in the search field. */
  function afterDelete(id: string): void {
    ownSheet.close();
    setText("");
    showSearch("search");
    void afterFoodGone(client, id);
  }

  const food = view.kind === "detail" ? (detail.data ?? view.food) : null;
  const shownFavourite = favourite.pending ?? food?.isFavourite ?? false;

  const header =
    view.kind === "detail" && food ? (
      <FoodDetailHeader
        favourite={shownFavourite}
        backRef={backRef}
        onBack={() => showSearch("row")}
        onToggleFavourite={() => favourite.toggle(food, !shownFavourite)}
      />
    ) : (
      <SearchField
        id={searchId}
        inputRef={inputRef}
        value={text}
        onChange={(next) => {
          setText(next);
          setNotice(null);
        }}
        autoFocus={!isMobile}
      />
    );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={food ? food.name : t("name")}
      header={header}
      size="tall"
      keyboardAware
      returnFocusTo={returnFocusTo}
      panelClassName="md:max-w-lg"
      stacked={
        <>
          {ownSheet.shown && (
            <OwnFoodSheet
              key={ownSheet.shown.key}
              open={ownSheet.isOpen}
              returnFocusTo={ownSheet.shown.opener}
              onClose={ownSheet.close}
              food={ownSheet.shown.value.food}
              initialName={ownSheet.shown.value.name}
              onSavedFood={(saved) => {
                if (view.kind === "detail" && view.food.id === saved.id) return;
                showDetail(saved, false);
              }}
              onDeleted={(id) => afterDelete(id)}
              onFoodGone={foodGone}
            />
          )}
          {portionSheet.shown && (
            <PortionSheet
              key={portionSheet.shown.key}
              open={portionSheet.isOpen}
              returnFocusTo={portionSheet.shown.opener}
              onClose={portionSheet.close}
              foodId={portionSheet.shown.value.foodId}
              portion={portionSheet.shown.value.portion}
              onDeleted={portionSheet.close}
              onFoodGone={foodGone}
              focusAfterDelete={() =>
                contentRef.current?.querySelector<HTMLElement>(`[${ADD_PORTION_ATTRIBUTE}]`) ?? null
              }
            />
          )}
          {remove.dialog}
        </>
      }
    >
      <PromptSheetBody focusSelf={isMobile}>
        <div ref={contentRef}>
          {view.kind === "detail" && food ? (
            <FoodDetailBody
              summary={view.food}
              detail={detail.data}
              unavailable={detail.data === undefined && (detail.isError || detail.fetchStatus === "paused")}
              favouriteError={favourite.error && !favouriteGone ? errors.forError(favourite.error) : null}
              onLeave={onClose}
              onAddPortion={(opener) => portionSheet.open(opener, { foodId: food.id })}
              onEditPortion={(portion, opener) => portionSheet.open(opener, { foodId: food.id, portion })}
              onEdit={(detail, opener) => ownSheet.open(opener, { food: detail, name: detail.name })}
              onDelete={(opener) => remove.open(food, opener)}
            />
          ) : (
            <FoodSearchView
              query={query}
              settled={settled}
              notice={notice}
              onOpen={(row) => showDetail(row, true)}
              onAddOwn={(name, opener) => ownSheet.open(opener, { name })}
            />
          )}
        </div>
      </PromptSheetBody>
    </BottomSheet>
  );
}

/**
 * The search field, pinned in the sheet's header: a text field with the
 * search icon and, once something is typed, a 44px button that clears it.
 * Enter puts the keyboard away, so the results show in full.
 */
function SearchField({
  id,
  inputRef,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  autoFocus: boolean;
}): ReactElement {
  const t = useTranslations("foods.sheet");
  return (
    <div role="search" className="relative pb-1">
      <label htmlFor={id} className="sr-only">
        {t("searchLabel")}
      </label>
      <span className="pointer-events-none absolute top-0 left-3.5 flex h-12 items-center text-ink-muted">
        <Icon name="search" className="size-5" />
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        autoFocus={autoFocus}
        className={`${inputClass} pr-12 pl-11`}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label={t("clear")}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className={`absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:text-ink ${focusRing}`}
        >
          <Icon name="close" className="size-5" />
        </button>
      )}
    </div>
  );
}
