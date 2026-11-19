"use client";

import { Card } from "@/components/ui/Card";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { linkClass } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

/** Fineli's own site and the licence its data is used under. */
export const FINELI_URL = "https://fineli.fi/";
export const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";
/** Open Food Facts and the licence its database is shared under. */
export const OPEN_FOOD_FACTS_URL = "https://openfoodfacts.org";
export const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";

/**
 * The credit for the food data. Fineli, THL and the CC BY 4.0 licence, with
 * the energy conversion stated. Then Open Food Facts and the Open Database
 * License, for the products looked up by barcode. Neither source endorses
 * the app, and each paragraph says so. A Fineli or Open Food Facts food's
 * detail links here, by `#food-data`.
 */
export function FoodDataSection(): ReactElement {
  const t = useTranslations("settings.foodData");
  const link = (href: `https://${string}`) =>
    function CreditLink(chunks: ReactNode) {
      return (
        <ExternalLink href={href} className={linkClass}>
          {chunks}
        </ExternalLink>
      );
    };
  return (
    <Card labelledBy="food-data-title">
      <div id="food-data" className="scroll-mt-4">
        <Card.Header id="food-data-title" title={t("title")} />
        <div className="space-y-4">
          <p className="text-base leading-relaxed text-ink">
            {t.rich("body", { fineli: link(FINELI_URL), licence: link(CC_BY_URL) })}
          </p>
          <p className="text-base leading-relaxed text-ink">
            {t.rich("openFoodFacts", { off: link(OPEN_FOOD_FACTS_URL), licence: link(ODBL_URL) })}
          </p>
        </div>
      </div>
    </Card>
  );
}
