"use client";

import { MacroDot } from "@/components/figures/MacroDot";
import { figuresLine, figuresLinePiece } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRecipeMeta } from "./useRecipeMeta";

// ---------------------------------------------------------------------------
// RecipeFiguresLine: one serving's calories and protein in a recipe's row,
// each figure after its dot in the macro's hue, in the monospaced face. The
// line keeps one line at every width, so rows with names of one length are
// one height: on a phone it reads "365 kcal" and "21.8 g protein", and from
// `md` it ends "per serving". Read aloud it always does. The Library's
// rows and the log sheet's recipe rows both draw it.
//
// A word is never cut. The two figures and the words after them are three
// pieces of a row that wraps, one line tall, with what wraps out of sight. So
// where the line is too narrow for all three, the words "protein" and "per
// serving" leave whole and both figures stay, each still after its dot.
// ---------------------------------------------------------------------------

export function RecipeFiguresLine({ recipe }: { recipe: Pick<RecipeSummary, "perServing"> }): ReactElement {
  const t = useTranslations("recipes.list");
  const meta = useRecipeMeta();
  return (
    <span data-recipe-figures-line="" className={`mt-1 ${figuresLine}`}>
      <span className="sr-only">{meta.figures(recipe)}</span>
      <span aria-hidden="true" className={figuresLinePiece}>
        <MacroDot macro="energy" />
        {t("kcal", { value: formatKcal(recipe.perServing.energyKcal) })}
      </span>
      <span aria-hidden="true" className={figuresLinePiece}>
        <MacroDot macro="protein" />
        {t("protein", { value: formatMacroGrams(recipe.perServing.proteinG) })}
      </span>
      <span aria-hidden="true" data-figures-words="">
        {t("proteinWord")}
        <span className="max-md:hidden"> {t("perServing")}</span>
      </span>
    </span>
  );
}
