"use client";

import { MacroFigures } from "@/components/figures/MacroFigures";
import { useRecipeMeta } from "@/components/recipes/useRecipeMeta";
import { btnSecondary, sectionTitle } from "@/components/ui/styles";
import { isPlainPress } from "@/lib/recipeNav";
import type { RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, type ReactElement } from "react";
import { LogBlock } from "./LogBlock";
import type { LogForm } from "./useLogForm";

// ---------------------------------------------------------------------------
// RecipeView: a recipe in the log sheet, opened from its row. The header (in
// the sheet) holds Back and the recipe's name. The body: the log block with
// Servings, the figures for that many and Eaten or planned, then the
// recipe's name, one serving's own figures, "Serves 2 · 25 min" and Open
// recipe, which leaves the sheet for the recipe's page. Log is in the
// footer. It logs the recipe as written. The actions under the figures are
// one column: Open recipe, and Log as made, which stacks the batch sheet on
// the log sheet for a batch made another way than written.
//
// The figures for the amount are `entryFigures` on the recipe's basis, the
// values the server writes into the entry (`useLogForm`), so one serving
// shows what "Per serving" shows.
// ---------------------------------------------------------------------------

export interface RecipeViewProps {
  recipe: RecipeSummary;
  form: LogForm;
  /** A plain press on Open recipe is leaving for the recipe's page: the sheet closes. */
  onLeave: () => void;
  /** Log as made: opens the batch sheet, stacked on the log sheet. */
  onLogAsMade: (opener: HTMLElement) => void;
  /** The recipe is being read for a press on Log as made. */
  readingForBatch: boolean;
}

export function RecipeView({ recipe, form, onLeave, onLogAsMade, readingForBatch }: RecipeViewProps): ReactElement {
  const t = useTranslations("log.recipe");
  const meta = useRecipeMeta();
  const headingId = `${useId()}-per-serving`;
  return (
    <div className="space-y-8">
      <LogBlock form={form} autoFocus={false} />
      <div className="space-y-6">
        <h2 className="font-display text-2xl font-medium break-words text-balance text-ink">{recipe.name}</h2>
        <section aria-labelledby={headingId}>
          <h3 id={headingId} className={`${sectionTitle} mb-2`}>
            {t("perServing")}
          </h3>
          <MacroFigures figures={recipe.perServing} energyWord="calories" />
          <p data-recipe-serves="" className="mt-3 text-base text-ink-muted">
            {meta.serves(recipe)}
          </p>
        </section>
        <div data-recipe-actions="" className="flex flex-col items-start gap-2">
          <Link
            href={`/recipes/${recipe.id}`}
            data-open-recipe=""
            onClick={(e) => {
              // A press that opens the recipe elsewhere, in a new tab, leaves the sheet as it is.
              if (isPlainPress(e)) onLeave();
            }}
            className={`${btnSecondary} w-full`}
          >
            {t("open")}
          </Link>
          <button
            type="button"
            data-log-as-made=""
            aria-haspopup="dialog"
            aria-busy={readingForBatch || undefined}
            onClick={(e) => onLogAsMade(e.currentTarget)}
            className={`${btnSecondary} w-full`}
          >
            {t("logAsMade")}
          </button>
        </div>
      </div>
    </div>
  );
}
