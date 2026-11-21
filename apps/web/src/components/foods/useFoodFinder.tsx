"use client";

import { btnSecondary, btnWide, noticeClass, sectionTitle } from "@/components/ui/styles";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSheetTarget, type SheetTarget } from "@/hooks/useSheetTarget";
import { barcodeOf } from "@/lib/barcode";
import { foodSearchQuery } from "@/lib/queryOptions";
import type { FoodDetail, FoodList, FoodSummary, LastAmount } from "@hovimestari/types";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { FoodRow } from "./FoodRow";
import { OwnFoodSheet, type OwnFoodTarget } from "./OwnFoodSheet";
import { useScanner } from "./scanner/useScanner";
import { ScannerSheet } from "./ScannerSheet";
import { SearchField } from "./SearchField";
import { useBarcodeMode } from "./useBarcodeMode";

// ---------------------------------------------------------------------------
// useFoodFinder: the food search, for a sheet that finds foods. Its parts sit
// in three slots of the sheet that hosts it, so it is a hook that returns
// them rather than a component:
//
// - `field`: the search field with its camera button, for the sheet's fixed
//   header.
// - `results(slots)`: the sheet's body on its search view. With fewer than
//   two characters typed, the host's own `browse` lists. A barcode typed or
//   scanned (8 to 14 digits), the barcode block (`useBarcodeMode`). Else the
//   food results, after the host's `lead` when it has one. The results keep
//   to the host's browse lists until typing has settled on two characters or
//   more and the first answer is in, and keep the last answer on screen while
//   the next loads, so the list is never blank in between. A query no food
//   matches offers to add it as the user's own food.
// - `stacked`: the scanner sheet and the own-food sheet, for the sheet's
//   `stacked` slot, so each is a nested sheet and the host recedes behind it.
//
// It renders nothing about logging. A food tapped, or found by barcode, goes
// to the host's `onPick`, which decides what a picked food opens. The log
// sheet (`FoodSheet`) and the recipe editor's ingredient picker each call it
// once and put its three slots in their own three slots.
//
// When the results replace the lists, and when the text changes, the sheet's
// body goes to its top, so the best matches are the first thing in view.
// ---------------------------------------------------------------------------

/** How long typing must pause before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 150;

/** The fewest characters a search is sent for. The server drops shorter words anyway. */
export const MIN_QUERY_LENGTH = 2;

export interface FoodFinderOptions {
  /** The host sheet is open. */
  open: boolean;
  /** The host can show a picked food now: on its search view, with none of its own sheets stacked. */
  canPick: boolean;
  /** The host's: its navigation focuses the field on Back. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The host's body, which the scanner returns focus within. */
  contentRef: RefObject<HTMLDivElement | null>;
  /** The host's status line. */
  say: (note: string) => void;
  /** A food row tapped, or a food found by barcode. `row` is what Back focuses. */
  onPick: (food: FoodSummary, row: HTMLElement | string | null, last: LastAmount | null | undefined) => void;
  /** An own food saved from the finder's own-food sheet. `row` is its held barcode row, or null. */
  onSavedOwnFood: (food: FoodDetail, row: string | null) => void;
  /** The own food open in the own-food sheet was deleted from it, and that sheet has closed itself. */
  onOwnFoodDeleted: (id: string) => void;
  /** The food a stacked sheet works on turned out to be gone. */
  onFoodGone: (id: string) => void;
  /** The field's text changed, typed or read by the scanner. */
  onType?: () => void;
  /** The field's label and placeholder, when the host searches something other than foods and meals. */
  label?: string;
}

/** What a host shows above the food results, and whether the foods then take their own heading. */
export type ResultsLead = (query: string) => { node: ReactNode; foodsTitled: boolean };

export interface FoodFinder {
  /** The search field with its camera button, for the host's fixed header. */
  field: ReactElement;
  /** The body: the barcode block, or the food results, or `browse` while fewer than two characters are typed. */
  results: (slots: { browse: ReactNode; lead?: ResultsLead; notice: string | null }) => ReactElement;
  /** The scanner sheet and the own-food sheet, for the host's `stacked` slot. */
  stacked: ReactElement;
  /** What the field holds, trimmed. */
  query: string;
  /** One of the finder's sheets is open, so the host's lists hold still. */
  stackedOpen: boolean;
  /** The own-food sheet, which the host's food view also opens to edit or copy a food. */
  ownSheet: SheetTarget<OwnFoodTarget>;
  /** Empties the field. A held barcode answer shows only while the field names its code, so it no longer shows. */
  reset: () => void;
  /** Drops a found barcode answer for a food that is gone. */
  forget: (foodId: string) => void;
}

export function useFoodFinder({
  open,
  canPick,
  inputRef,
  contentRef,
  say,
  onPick,
  onSavedOwnFood,
  onOwnFoodDeleted,
  onFoodGone,
  onType,
  label,
}: FoodFinderOptions): FoodFinder {
  const isMobile = useIsMobile();
  const searchId = `${useId()}-search`;
  const [text, setText] = useState("");
  const query = text.trim();
  const settled = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const ownSheet = useSheetTarget<OwnFoodTarget>();

  /** The search field's text changed, typed or read by the scanner. */
  function typeText(next: string): void {
    setText(next);
    onType?.();
    barcode.textChanged(next);
  }

  const scanner = useScanner({
    setText: typeText,
    lookUp: (code, format) => barcode.lookUp(code, format),
    say,
    inputRef,
    contentRef,
  });
  const stackedOpen = scanner.sheet.isOpen || ownSheet.isOpen;

  const barcode = useBarcodeMode({
    query,
    canOpenFood: open && canPick && !stackedOpen,
    showFood: onPick,
    onFromLabel: (start, opener) => ownSheet.open(opener, { start }),
  });

  const field = (
    <SearchField
      id={searchId}
      inputRef={inputRef}
      value={text}
      onChange={typeText}
      onEnter={barcode.onEnter}
      onScan={scanner.open}
      autoFocus={!isMobile}
      label={label}
    />
  );

  const stacked = (
    <>
      {scanner.sheet.shown && (
        <ScannerSheet
          key={`scanner-${scanner.sheet.shown.key}`}
          open={scanner.sheet.isOpen}
          returnFocusTo={scanner.sheet.shown.opener}
          restoreFocusOnClose={scanner.restoreFocusOnClose}
          onClose={scanner.sheet.close}
          onRead={scanner.onRead}
          onTypeNumber={scanner.onTypeNumber}
        />
      )}
      {ownSheet.shown && (
        <OwnFoodSheet
          key={`own-${ownSheet.shown.key}`}
          open={ownSheet.isOpen}
          returnFocusTo={ownSheet.shown.opener}
          onClose={ownSheet.close}
          {...ownSheet.shown.value}
          onSavedFood={(saved: FoodDetail) => {
            // Saved with the held code: the block holds it as found, and Back focuses its row.
            onSavedOwnFood(saved, barcode.savedOwnFood(saved));
          }}
          onDeleted={onOwnFoodDeleted}
          onFoodGone={onFoodGone}
        />
      )}
    </>
  );

  return {
    field,
    results: ({ browse, lead, notice }) => (
      <FinderResults
        query={query}
        settled={settled}
        notice={notice}
        barcode={barcode.block}
        browse={browse}
        lead={lead}
        onOpen={(food, opener) => onPick(food, opener, undefined)}
        onAddOwn={(name, opener) => ownSheet.open(opener, { start: { name } })}
      />
    ),
    stacked,
    query,
    stackedOpen,
    ownSheet,
    reset: () => setText(""),
    forget: barcode.forget,
  };
}

interface FinderResultsProps {
  query: string;
  settled: string;
  notice: string | null;
  barcode: ReactElement | null;
  browse: ReactNode;
  lead: ResultsLead | undefined;
  onOpen: (food: FoodSummary, opener: HTMLElement) => void;
  onAddOwn: (name: string, opener: HTMLElement) => void;
}

function FinderResults({
  query,
  settled,
  notice,
  barcode,
  browse,
  lead,
  onOpen,
  onAddOwn,
}: FinderResultsProps): ReactElement {
  // A barcode is never searched as a name, also while the debounced text still holds one the field has left.
  const searching =
    barcode === null &&
    barcodeOf(settled) === null &&
    query.length >= MIN_QUERY_LENGTH &&
    settled.length >= MIN_QUERY_LENGTH;
  const search = useQuery({ ...foodSearchQuery(settled), enabled: searching });
  // The first answer for a search is on its way: the lists stay until it lands.
  const firstLoad = search.data === undefined && search.fetchStatus === "fetching";
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
  const led = showsResults && lead ? lead(query) : null;
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
        browse
      ) : (
        <>
          {led?.node}
          {/* Under what leads, the foods have a heading of their own, so the two read as two. */}
          <Results
            settled={settled}
            search={search}
            onOpen={onOpen}
            onAddOwn={onAddOwn}
            title={led?.foodsTitled ? tResults("foods") : undefined}
          />
        </>
      )}
    </div>
  );
}

function Results({
  settled,
  search,
  onOpen,
  onAddOwn,
  title,
}: Pick<FinderResultsProps, "settled" | "onOpen" | "onAddOwn"> & {
  search: UseQueryResult<FoodList>;
  /** A heading over the foods, when something shows above them. */
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
