"use client";

import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { Per100g } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Per100gFigures: a food's four figures per 100 g, one row each. A dot in the
// macro's reserved hue marks the row, and the figure itself stays in ink.
// This is where the four macro hues are drawn, and the only place: a test
// greps src/ for them (docs/app/colors.md, "The macro hues").
//
// The figures are the API's, rounded for display only: kcal to a whole
// number, grams with one decimal always, so the right-aligned column's
// decimals line up.
// ---------------------------------------------------------------------------

const ROWS = [
  { key: "energy", dot: "bg-energy", value: (f: Per100g) => f.energyKcal, unit: "kcal" },
  { key: "protein", dot: "bg-protein", value: (f: Per100g) => f.proteinG, unit: "grams" },
  { key: "carbs", dot: "bg-carbs", value: (f: Per100g) => f.carbsG, unit: "grams" },
  { key: "fat", dot: "bg-fat", value: (f: Per100g) => f.fatG, unit: "grams" },
] as const;

type T = ReturnType<typeof useTranslations<"foods.detail">>;

function labelOf(t: T, key: (typeof ROWS)[number]["key"]): string {
  switch (key) {
    case "energy":
      return t("energy");
    case "protein":
      return t("protein");
    case "carbs":
      return t("carbs");
    case "fat":
      return t("fat");
  }
}

export function Per100gFigures({ figures }: { figures: Per100g }): ReactElement {
  const t = useTranslations("foods.detail");
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {ROWS.map((row) => {
        const value = row.value(figures);
        return (
          <div key={row.key} data-macro={row.key} className="flex min-h-12 items-center gap-3 py-2">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-pill ${row.dot}`} />
            <dt className="flex-1 text-base text-ink">{labelOf(t, row.key)}</dt>
            <dd className="font-mono text-base text-ink tabular-nums">
              {row.unit === "kcal"
                ? t("kcal", { value: formatKcal(value) })
                : t("grams", { value: formatMacroGrams(value) })}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
