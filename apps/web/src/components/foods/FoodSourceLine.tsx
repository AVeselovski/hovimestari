"use client";

import { ExternalLink } from "@/components/ui/ExternalLink";
import { linkClass } from "@/components/ui/styles";
import { openFoodFactsUrl } from "@/lib/barcode";
import type { FoodSource } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";

/** Where Settings credits the food data. The detail of a Fineli or Open Food Facts food links to it. */
export const FOOD_DATA_HREF = "/settings#food-data";

const linkTarget = `${linkClass} inline-flex min-h-11 items-center`;

/**
 * Where a food's figures come from. A Fineli food links to the credit in
 * Settings. An Open Food Facts food links to its own page there, in a new
 * tab, once its barcode is known from the detail, and to the credit.
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
  if (source === "user") return <p className="text-sm text-ink-muted">{t("sourceOwn")}</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
      <span>{source === "fineli" ? t("sourceFineli") : t("sourceOpenFoodFacts")}</span>
      {source === "open_food_facts" && barcode && (
        <ExternalLink href={openFoodFactsUrl(barcode)} className={linkTarget}>
          {t("seeOnOpenFoodFacts")}
        </ExternalLink>
      )}
      <Link href={FOOD_DATA_HREF} onClick={onLeave} className={linkTarget}>
        {t("aboutData")}
      </Link>
    </p>
  );
}
