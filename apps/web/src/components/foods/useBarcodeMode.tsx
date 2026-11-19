"use client";

import { barcodeOf } from "@/lib/barcode";
import type { BarcodeFormat, FoodDetail, FoodSummary, LastAmount } from "@hovimestari/types";
import type { ReactElement } from "react";
import { BARCODE_LIST, BarcodeResult } from "./BarcodeResult";
import { FOOD_ROW_ATTRIBUTE } from "./FoodRow";
import type { OwnFoodStart } from "./ownFoodForm";
import { useBarcodeLookup } from "./useBarcodeLookup";

// ---------------------------------------------------------------------------
// useBarcodeMode: the log sheet's barcode mode, wired to the sheet. The
// search field's text names the code: text of 8 to 14 digits puts the search
// view in barcode mode, and the block (`BarcodeResult`) stands in place of
// the lists. The hook holds the lookup (`useBarcodeLookup`) and keeps it true
// to the text and to the foods:
//
// - The held answer shows only while the text names its code. Text that
//   stops naming it drops it.
// - A found food opens its food view only while the sheet can show one (it
//   is open, on its search view, with nothing stacked on it) and the text
//   still names the code. Back focuses the held row.
// - The held row opens the food with its last amount, as the first open did.
// - A found food deleted, gone, or saved with another barcode is forgotten,
//   so the block offers Look up again rather than a food that is not there.
//
// A scan sets the field's text to the code it read, then calls `lookUp` with
// that code and its format, so the held answer and the food view key on the
// text alone, whatever put the code there. Look up, Enter and Try again send
// the held format again. A number typed by hand drops it with the code.
// ---------------------------------------------------------------------------

export interface BarcodeModeOptions {
  /** The search field's text, trimmed. */
  query: string;
  /** The sheet can open a food view now: it is open, on its search view, with nothing stacked on it. */
  canOpenFood: boolean;
  /** Opens a food's view. `row` is the row that opened it, or a selector for the row Back focuses. */
  showFood: (food: FoodSummary, row: HTMLElement | string, last: LastAmount | null | undefined) => void;
  /** Opens the own-food sheet on a start. */
  onFromLabel: (start: OwnFoodStart, opener: HTMLElement) => void;
}

export interface BarcodeMode {
  /** The code the text names, or null outside barcode mode. */
  code: string | null;
  /** The block for the search view, or null outside barcode mode. */
  block: ReactElement | null;
  /** Looks `code` up with a scan's `format`. The scan sets the field's text to `code` first. */
  lookUp: (code: string, format?: BarcodeFormat) => void;
  /** What Enter in the field does: looks the code up. Undefined outside barcode mode. */
  onEnter: (() => void) | undefined;
  /** The field's text changed. A held answer for another code is dropped. */
  textChanged: (text: string) => void;
  /** An own food was saved. The selector of its held row when the block now holds it as found, else null. */
  savedOwnFood: (food: FoodDetail) => string | null;
  /** The food is deleted or gone: a found answer for it is dropped. */
  forget: (foodId: string) => void;
}

/** The held row of a food found by barcode, which Back from its view focuses. */
const barcodeRow = (food: FoodSummary): string =>
  `[data-list="${BARCODE_LIST}"] [${FOOD_ROW_ATTRIBUTE}="${CSS.escape(food.id)}"]`;

export function useBarcodeMode({ query, canOpenFood, showFood, onFromLabel }: BarcodeModeOptions): BarcodeMode {
  const code = barcodeOf(query);
  const lookup = useBarcodeLookup({
    onFound: (found, foundCode) => {
      if (!canOpenFood || code !== foundCode) return;
      showFood(found, barcodeRow(found), found.lastAmount);
    },
  });
  const held = code !== null && lookup.state?.code === code ? lookup.state : null;
  /** The code again, with the format it was held with. */
  const again = (shown: string) => () => lookup.lookUp(shown, held?.format);

  return {
    code,
    block:
      code === null ? null : (
        <BarcodeResult
          code={code}
          state={held}
          offline={lookup.offline}
          onLookUp={again(code)}
          onOpenFood={(food, opener) => showFood(food, opener, food.lastAmount)}
          onFromLabel={onFromLabel}
        />
      ),
    lookUp: lookup.lookUp,
    onEnter: code === null ? undefined : again(code),
    textChanged: (text) => {
      if (lookup.state !== null && barcodeOf(text) !== lookup.state.code) lookup.drop();
    },
    savedOwnFood: (food) => (lookup.savedOwnFood(food) ? barcodeRow(food) : null),
    forget: lookup.forget,
  };
}
