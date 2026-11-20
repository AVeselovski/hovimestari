"use client";

import { MacroDot, type Macro } from "@/components/figures/MacroDot";
import { Icon } from "@/components/Icon";
import { btnText, cardClass, focusRing, inputClass } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import type { Figures } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// RecipeFigures: a recipe's figures card. One table: a row per figure, its
// dot in the macro's hue, then one serving's figure and the whole recipe's.
// The recipe page puts a servings stepper over it: at another number of
// servings the second column reads "For 4 servings", and "Back to 2" shows
// beside the stepper. That room is kept while it is hidden, and every
// column heading holds one line, so stepping never moves what is under the
// card. The editor shows the card without the stepper, with the figures as
// they are typed, or empty slots of the same height while they cannot be
// computed.
//
// The figures are rounded for display only, kcal to a whole number and grams
// with one decimal, as everywhere a figure shows.
// ---------------------------------------------------------------------------

const ROWS = [
  { macro: "energy", value: (f: Figures) => f.energyKcal, kcal: true },
  { macro: "protein", value: (f: Figures) => f.proteinG, kcal: false },
  { macro: "carbs", value: (f: Figures) => f.carbsG, kcal: false },
  { macro: "fat", value: (f: Figures) => f.fatG, kcal: false },
] as const satisfies readonly { macro: Macro; value: (f: Figures) => number; kcal: boolean }[];

/** The servings stepper, on the recipe page only. */
export interface ServingsStepper {
  /** What the field holds, as typed. */
  text: string;
  /** The servings the figures are for: the field's value once it is a whole number from 1 to 100. */
  shown: number;
  /** The recipe's own servings, which "Back to" returns to. */
  servings: number;
  onText: (text: string) => void;
  onStep: (next: number) => void;
  id: string;
}

export interface RecipeFiguresProps {
  /** One serving, or null for empty slots of the same height. */
  perServing: Figures | null;
  /** All the servings shown: the whole recipe, or the stepper's number of servings. */
  whole: Figures | null;
  stepper?: ServingsStepper;
  /** An id for the card's heading, which names the region. */
  headingId: string;
  /** A line under the table, such as why the figures are empty. */
  note?: ReactElement | null;
}

export function RecipeFigures({ perServing, whole, stepper, headingId, note }: RecipeFiguresProps): ReactElement {
  const t = useTranslations("recipes.page");
  const tFigures = useTranslations("figures");
  const scaled = stepper !== undefined && stepper.shown !== stepper.servings;
  const labelOf = (macro: Macro): ReactElement =>
    macro === "carbs" ? (
      // "Carbs" on a phone, where the column is narrow, and "Carbohydrates" aloud and from md.
      <>
        <span aria-hidden="true" className="md:hidden">
          {tFigures("carbsShort")}
        </span>
        <span className="max-md:sr-only">{tFigures("carbs")}</span>
      </>
    ) : (
      <>{macro === "energy" ? tFigures("calories") : tFigures(macro)}</>
    );
  const cell = (f: Figures | null, row: (typeof ROWS)[number]): string =>
    f === null ? "" : row.kcal ? `${formatKcal(row.value(f))} kcal` : `${formatMacroGrams(row.value(f))} g`;
  return (
    <section aria-labelledby={headingId} data-recipe-figures="" className={`${cardClass} p-4 md:p-6`}>
      <h2 id={headingId} className="sr-only">
        {t("figures")}
      </h2>
      {stepper && <Stepper stepper={stepper} scaled={scaled} />}
      <table className="w-full table-fixed border-collapse text-base">
        <thead>
          <tr className="text-sm text-ink-muted">
            <td className="w-[38%] pb-2" />
            <th scope="col" className="pb-2 text-right font-semibold whitespace-nowrap">
              {t("perServing")}
            </th>
            <th scope="col" className="pb-2 text-right font-semibold whitespace-nowrap" data-whole-heading="">
              {scaled ? t("forServings", { count: stepper.shown }) : t("whole")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.macro} className="border-t border-rule">
              <th scope="row" className="py-2 text-left font-normal text-ink">
                <span className="flex items-center gap-2">
                  <MacroDot macro={row.macro} />
                  <span className="truncate">{labelOf(row.macro)}</span>
                </span>
              </th>
              <td className="py-2 text-right font-mono text-ink tabular-nums">{cell(perServing, row)}</td>
              <td className="py-2 text-right font-mono text-ink tabular-nums">{cell(whole, row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note}
    </section>
  );
}

function Stepper({ stepper, scaled }: { stepper: ServingsStepper; scaled: boolean }): ReactElement {
  const t = useTranslations("recipes.page");
  const step = (by: number) => stepper.onStep(Math.min(100, Math.max(1, stepper.shown + by)));
  const square = `inline-flex size-12 shrink-0 items-center justify-center rounded-control border border-field-rule bg-surface-raised text-ink hover:bg-surface active:bg-surface disabled:opacity-40 ${focusRing}`;
  return (
    <div className="mb-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={stepper.id} className="text-base font-semibold text-ink">
          {t("servings")}
        </label>
        {/* Its room is kept while hidden, so it never moves what is beside or under it. */}
        <button
          type="button"
          onClick={() => stepper.onStep(stepper.servings)}
          aria-hidden={scaled ? undefined : true}
          tabIndex={scaled ? undefined : -1}
          className={`${btnText} ${scaled ? "" : "invisible"}`}
        >
          {t("backTo", { count: stepper.servings })}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          aria-label={t("fewer")}
          aria-controls={stepper.id}
          disabled={stepper.shown <= 1}
          onClick={() => step(-1)}
          className={square}
        >
          <Icon name="minus" className="size-5" />
        </button>
        <input
          id={stepper.id}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          value={stepper.text}
          onChange={(e) => stepper.onText(e.target.value)}
          onBlur={() => stepper.onText(String(stepper.shown))}
          className={`${inputClass} w-20! px-1! text-center font-mono text-lg! tabular-nums`}
        />
        <button
          type="button"
          aria-label={t("more")}
          aria-controls={stepper.id}
          disabled={stepper.shown >= 100}
          onClick={() => step(1)}
          className={square}
        >
          <Icon name="plus" className="size-5" />
        </button>
      </div>
    </div>
  );
}
