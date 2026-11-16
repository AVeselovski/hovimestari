"use client";

import { Card } from "@/components/ui/Card";
import { linkClass } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

/** Fineli's own site and the licence its data is used under. */
export const FINELI_URL = "https://fineli.fi/";
export const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * The credit for the food data: Fineli, THL and the CC BY 4.0 licence, with
 * the energy conversion stated and no suggestion that THL endorses the app.
 * A Fineli food's detail links here, by `#food-data`.
 */
export function FoodDataSection(): ReactElement {
  const t = useTranslations("settings.foodData");
  const link = (href: string) =>
    function ExternalLink(chunks: ReactNode) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {chunks}
        </a>
      );
    };
  return (
    <Card labelledBy="food-data-title">
      <div id="food-data" className="scroll-mt-4">
        <Card.Header id="food-data-title" title={t("title")} />
        <p className="text-base leading-relaxed text-ink">
          {t.rich("body", { fineli: link(FINELI_URL), licence: link(CC_BY_URL) })}
        </p>
      </div>
    </Card>
  );
}
