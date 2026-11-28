"use client";

import { btnText } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { monoDigits } from "./digits";

// ---------------------------------------------------------------------------
// CarriedLine: the line at the top of the food search while it carries a
// barcode from a scan that found nothing. "Barcode {code} goes on the food
// you save as your own.", then Forget the barcode under it. It holds no
// state: the finder carries the code and says what Forget does.
//
// The status region is always in the search view, empty while nothing is
// carried, so a screen reader hears the line as the barcode block gives way
// to it. A food's view replaces the search view, and Back mounts the region
// again with the line already in it. The button sits outside the region, so
// the region says the line alone.
// ---------------------------------------------------------------------------

/** The attribute the line's block carries, for tests and for measuring it. */
export const CARRIED_LINE_ATTRIBUTE = "data-carried-line";

export interface CarriedLineProps {
  /** The barcode carried, or null while none is. */
  code: string | null;
  /** Forget the barcode was pressed. */
  onForget: () => void;
}

export function CarriedLine({ code, onForget }: CarriedLineProps): ReactElement {
  const t = useTranslations("foods.sheet");
  return (
    <div {...{ [CARRIED_LINE_ATTRIBUTE]: code === null ? undefined : "" }} className={code === null ? "" : "mb-4"}>
      <div role="status">
        {code !== null && (
          <p className="text-base break-words text-ink">
            {t.rich("carried", {
              code,
              digits: monoDigits,
            })}
          </p>
        )}
      </div>
      {code !== null && (
        // Clear of the line above, so its focus ring never crosses the line's last row.
        <button type="button" onClick={onForget} className={`${btnText} mt-1`}>
          {t("forgetCarried")}
        </button>
      )}
    </div>
  );
}
