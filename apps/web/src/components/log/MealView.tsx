"use client";

import { MacroFigures } from "@/components/figures/MacroFigures";
import { btnSecondary, btnText, btnTextDanger, sectionTitle } from "@/components/ui/styles";
import type { SavedMeal } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";
import { LogBlock } from "./LogBlock";
import type { LogForm } from "./useLogForm";

// ---------------------------------------------------------------------------
// MealView: a saved meal in the log sheet, opened from its row. The header
// (in the sheet) holds Back and the meal's name. The body: the log block
// with the number of meals, then the meal's name, where it comes from when it
// has a source, its own figures per meal, and what can be done to it: Edit
// meal, Archive meal or Restore meal, Delete meal. Log is in the footer. An
// archived meal can be logged.
// ---------------------------------------------------------------------------

export interface MealViewProps {
  meal: SavedMeal;
  form: LogForm;
  onEdit: (opener: HTMLElement) => void;
  onArchive: (archived: boolean) => void;
  onDelete: (opener: HTMLElement) => void;
  /** An archive or restore runs. */
  busy: boolean;
  /** Writes wait: the app asks the server for today. */
  held: boolean;
}

export function MealView({ meal, form, onEdit, onArchive, onDelete, busy, held }: MealViewProps): ReactElement {
  const t = useTranslations("log.block");
  const tMeal = useTranslations("log.meal");
  const headingId = `${useId()}-per-meal`;
  const waits = busy || held;
  return (
    <div className="space-y-8">
      <LogBlock form={form} autoFocus={false} />
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium break-words text-balance text-ink">{meal.name}</h2>
          {meal.source !== null && <p className="text-base text-ink-muted">{t("from", { source: meal.source })}</p>}
        </div>
        <section aria-labelledby={headingId}>
          <h3 id={headingId} className={`${sectionTitle} mb-2`}>
            {t("perMeal")}
          </h3>
          <MacroFigures figures={meal.figures} energyWord="calories" />
        </section>
        <div data-meal-actions="" className="flex flex-col items-start gap-2">
          <button type="button" onClick={(e) => onEdit(e.currentTarget)} className={`${btnSecondary} w-full`}>
            {tMeal("edit")}
          </button>
          <button
            type="button"
            aria-disabled={waits || undefined}
            aria-busy={busy || undefined}
            onClick={() => {
              if (!waits) onArchive(!meal.archived);
            }}
            className={btnText}
          >
            {meal.archived ? tMeal("restore") : tMeal("archive")}
          </button>
          <button type="button" onClick={(e) => onDelete(e.currentTarget)} className={btnTextDanger}>
            {tMeal("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
