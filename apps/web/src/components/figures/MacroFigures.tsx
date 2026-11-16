"use client";

import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { Figures } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { MacroDot, type Macro } from "./MacroDot";

// ---------------------------------------------------------------------------
// MacroFigures: four figures, one row each, energy, protein, carbohydrates
// and fat. A dot in the macro's hue marks each row, and the figure stays in
// ink. A food's figures per 100 g and an entry's figures for its amount both
// render through it.
//
// The figures are the API's, or `entryFigures` from @hovimestari/types, the
// function the server runs. They are rounded for display only: kcal to a
// whole number, grams with one decimal always, so the right-aligned column's
// decimals line up. With no figures, every row keeps its
// height and its figure slot stays empty, so a preview filling in moves
// nothing. An estimate's figures start with "≈", read as "estimated".
// ---------------------------------------------------------------------------

const ROWS = [
  { macro: "energy", value: (f: Figures) => f.energyKcal, unit: "kcal" },
  { macro: "protein", value: (f: Figures) => f.proteinG, unit: "grams" },
  { macro: "carbs", value: (f: Figures) => f.carbsG, unit: "grams" },
  { macro: "fat", value: (f: Figures) => f.fatG, unit: "grams" },
] as const satisfies readonly { macro: Macro; value: (f: Figures) => number; unit: "kcal" | "grams" }[];

type T = ReturnType<typeof useTranslations<"figures">>;

function labelOf(t: T, macro: Macro, energyWord: EnergyWord): string {
  switch (macro) {
    case "energy":
      return energyWord === "calories" ? t("calories") : t("energy");
    case "protein":
      return t("protein");
    case "carbs":
      return t("carbs");
    case "fat":
      return t("fat");
  }
}

/** The energy row's label: "Energy" in a food's per-100 g table, "Calories" where the screen around it says Calories. */
export type EnergyWord = "energy" | "calories";

export interface MacroFiguresProps {
  /** The four figures, or null for empty slots of the same height. */
  figures: Figures | null;
  /** The figures are an estimate's: each starts with "≈". */
  estimate?: boolean;
  /** The energy row's label. Defaults to "Energy". */
  energyWord?: EnergyWord;
}

export function MacroFigures({ figures, estimate = false, energyWord = "energy" }: MacroFiguresProps): ReactElement {
  const t = useTranslations("figures");
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {ROWS.map((row) => {
        const value = figures === null ? null : row.value(figures);
        return (
          <div key={row.macro} data-macro={row.macro} className="flex min-h-12 items-center gap-3 py-2">
            <MacroDot macro={row.macro} />
            <dt className="flex-1 text-base text-ink">{labelOf(t, row.macro, energyWord)}</dt>
            <dd className="font-mono text-base text-ink tabular-nums">
              {value !== null && estimate && (
                <>
                  <span aria-hidden="true">{t("approx")}</span>
                  <span className="sr-only">{t("estimated")}</span>
                </>
              )}
              {value !== null &&
                (row.unit === "kcal"
                  ? t("kcal", { value: formatKcal(value) })
                  : t("grams", { value: formatMacroGrams(value) }))}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
