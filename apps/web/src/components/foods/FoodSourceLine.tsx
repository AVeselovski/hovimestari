"use client";

import { linkClass } from "@/components/ui/styles";
import type { FoodSource } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactElement } from "react";

/** Where Settings credits the food data. The detail of a Fineli food links to it. */
export const FOOD_DATA_HREF = "/settings#food-data";

/**
 * Where a food's figures come from. A Fineli food links to the credit in
 * Settings. `onLeave` runs as that link is followed, so the sheet the line
 * sits in closes rather than vanishing with the page.
 */
export function FoodSourceLine({ source, onLeave }: { source: FoodSource; onLeave: () => void }): ReactElement {
  const t = useTranslations("foods.detail");
  if (source === "user") return <p className="text-sm text-ink-muted">{t("sourceOwn")}</p>;
  if (source === "open_food_facts") return <p className="text-sm text-ink-muted">{t("sourceOpenFoodFacts")}</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
      <span>{t("sourceFineli")}</span>
      <Link href={FOOD_DATA_HREF} onClick={onLeave} className={`${linkClass} inline-flex min-h-11 items-center`}>
        {t("aboutData")}
      </Link>
    </p>
  );
}
