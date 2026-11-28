"use client";

import { ExternalLink } from "@/components/ui/ExternalLink";
import { foodSourceRow, linkClass } from "@/components/ui/styles";
import { openFoodFactsUrl } from "@/lib/barcode";
import type { FoodSource } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";
import { monoDigits } from "./digits";

/** Where Settings credits the food data. The detail of a Fineli or Open Food Facts food links to it. */
export const FOOD_DATA_HREF = "/settings#food-data";

const linkTarget = `${linkClass} inline-flex min-h-11 items-center`;

/**
 * Where a food's figures come from, in one row for every source, one row at
 * 320 px wide too. An own food's row says "My food" and links nowhere, then
 * its barcode when it has one, so the person sees what a scan finds. A
 * Fineli food's says "From Fineli", then About the data, the link to the
 * credit in Settings. An Open Food Facts food's says "From Open Food Facts",
 * whose words Open Food Facts are the link to the product's page there, in
 * a new tab, once its barcode is known from the detail, then About the data.
 * `onLeave` runs as the credit's link is followed, so the sheet the line
 * sits in closes rather than vanishing with the page.
 */
export function FoodSourceLine({
  source,
  barcode,
  onLeave,
}: {
  source: FoodSource;
  /** The food's barcode, once its detail has loaded. */
  barcode?: string | null;
  onLeave: () => void;
}): ReactElement {
  const t = useTranslations("foods.detail");
  const label =
    source === "user"
      ? t("sourceOwn")
      : source === "fineli"
        ? t("sourceFineli")
        : t.rich("sourceOpenFoodFacts", {
            page: (words) =>
              barcode ? (
                <ExternalLink href={openFoodFactsUrl(barcode)} label={t("openFoodFactsPage")} className={linkTarget}>
                  {words}
                </ExternalLink>
              ) : (
                words
              ),
          });
  return (
    <p data-food-source="" className={foodSourceRow}>
      {/* As tall as a link, so the words sit at one height on every source. The inner span keeps
          the space between "From" and a link, which a flex row would drop. */}
      <span className="inline-flex min-h-11 items-center">
        <span>{label}</span>
      </span>
      {source === "user" && barcode && (
        <span data-own-barcode="" className="inline-flex min-h-11 items-center">
          {/* One span, so the flex row keeps the space before the digits. */}
          <span>{t.rich("ownBarcode", { code: barcode, digits: monoDigits })}</span>
        </span>
      )}
      {source !== "user" && (
        <Link href={FOOD_DATA_HREF} onClick={onLeave} className={linkTarget}>
          {t("aboutData")}
        </Link>
      )}
    </p>
  );
}
