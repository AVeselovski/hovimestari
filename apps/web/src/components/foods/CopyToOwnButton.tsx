"use client";

import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { btnWide } from "@/components/ui/styles";
import type { FoodDetail, FoodSource } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { copyStartOf, isCopyable } from "./ownFoodForm";
import type { CopyToOwn } from "./useFoodFinder";

export interface CopyToOwnButtonProps {
  /** Where the food comes from, known from the row it was opened from, so the button holds its place from the start. */
  source: FoodSource;
  /** The food's detail. A press waits for it, since the form opens on its values, barcode and portions. */
  detail: FoodDetail | undefined;
  /** The detail could not be read (`detailUnavailable`): the button goes rather than wait for good. */
  unavailable: boolean;
  /** The finder's: the barcode it carries, and what opens its own-food form. */
  copy: CopyToOwn;
}

/**
 * Copy to my foods, under a rule: for a food from Fineli or Open Food Facts,
 * which nobody edits. It opens the own-food form with the food's name,
 * values and portions, the portions named as the screen names them. While
 * the food search carries a barcode from a miss, it says it takes the
 * barcode, and the form opens with it. The log sheet's food view shows it
 * under the food's source line, the ingredient picker's amount view under
 * its amount, by this one rule.
 *
 * It shows as the view opens, so nothing under it moves when the detail
 * lands. Until then it waits (`aria-disabled`) and a press opens nothing.
 * When the detail cannot be read it does not show, and a read that then
 * succeeds brings it back.
 */
export function CopyToOwnButton({ source, detail, unavailable, copy }: CopyToOwnButtonProps): ReactElement | null {
  const t = useTranslations("foods.detail");
  const portionLabel = usePortionChipLabel();
  if (source === "user" || (detail === undefined && unavailable)) return null;
  const ready = detail !== undefined && isCopyable(detail);
  return (
    <div className="border-t border-rule pt-4">
      <button
        type="button"
        aria-disabled={ready ? undefined : true}
        onClick={(e) => {
          if (ready) copy.open(copyStartOf(detail, portionLabel), e.currentTarget);
        }}
        // Balanced, so a label on two rows splits evenly: "Copy to my foods / with the barcode" at 320 px.
        className={`${btnWide} text-balance`}
      >
        {copy.carried === null ? t("copyToOwn") : t("copyToOwnWithBarcode")}
      </button>
    </div>
  );
}
