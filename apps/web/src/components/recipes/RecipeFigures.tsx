"use client";

import { MacroDot, type Macro } from "@/components/figures/MacroDot";
import { Icon } from "@/components/Icon";
import { btnText, cardClass, cardInSheetClass, stepperButton, stepperField } from "@/components/ui/styles";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { MAX_RECIPE_SERVINGS, type Figures } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// RecipeFigures: a recipe's figures card. One table: a row per figure, its
// dot in the macro's hue, then one serving's figure and the whole recipe's.
// The recipe page puts a servings stepper over it: at another number of
// servings the second column reads "For 4 servings", and "Back to 2" shows
// beside the stepper. The editor shows the card without the stepper, with
// the figures as they are typed, or empty slots of the same height while
// they cannot be computed.
//
// Nothing in the card changes its height, so stepping never moves what is
// under it:
// - The two figure columns have fixed widths, each wide enough for the
//   largest figure a recipe can have at 100 servings (10000 kcal a serving,
//   1000000 kcal for the hundred, and 1000.0 g and 100000.0 g), with 12px
//   or more before each, so two figures never touch. The label takes the
//   rest, which at 320 pixels is just the room of "Calories kcal".
// - On a phone the unit sits once in the row's label ("Calories kcal"), and
//   the cells hold the numbers alone. That is what lets both columns hold
//   their largest figure at 320 pixels. From `md` each cell carries its unit.
//   Read aloud, a cell always has its unit. In a form sheet (`inSheet`),
//   whose body is 8px narrower than a page, the card gives that room and
//   4px more back from its sides, so the label fits there too.
// - On a phone a column heading may take two lines, and keeps two lines'
//   room. From `md` it is one line.
// - "Back to 2" keeps its room while hidden, and the stepper keeps its room
//   while the recipe is still being read (`stepperRoom`).
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
  /** The person has changed the servings on this page, so a change of figures is said aloud. */
  touched: boolean;
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
  /** Keeps the stepper's room while there is no stepper yet, as the recipe is read. */
  stepperRoom?: boolean;
  /** The figures are on their way. */
  busy?: boolean;
  /** An id for the card's heading, which names the region. */
  headingId: string;
  /** A line under the table, such as why the figures are empty. */
  note?: ReactElement | null;
  /** The card is in a form sheet, whose body is narrower than a page: on a phone it keeps less room at its sides, and it takes the surface the sheet is not on. */
  inSheet?: boolean;
  /** The second column's heading where it is not a whole recipe, such as "Whole batch". */
  wholeLabel?: string;
}

const headCell = "pb-2 text-right align-bottom font-semibold max-md:h-12 md:whitespace-nowrap";
const figureCell = "py-2 text-right font-mono text-sm whitespace-nowrap text-ink tabular-nums md:text-base";
/** The room before each figure column: 12px before one serving's on a phone, 16px elsewhere. */
const beforeFirst = "pl-3 md:pl-4";
const beforeSecond = "pl-4";

export function RecipeFigures({
  perServing,
  whole,
  stepper,
  stepperRoom = false,
  busy = false,
  headingId,
  note,
  inSheet = false,
  wholeLabel,
}: RecipeFiguresProps): ReactElement {
  const t = useTranslations("recipes.page");
  const tFigures = useTranslations("figures");
  const scaled = stepper !== undefined && stepper.shown !== stepper.servings;
  const wholeHeading = scaled ? t("forServings", { count: stepper.shown }) : (wholeLabel ?? t("whole"));
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
  const unitOf = (row: (typeof ROWS)[number]): string => (row.kcal ? tFigures("unitKcal") : tFigures("unitGrams"));
  const numberOf = (f: Figures, row: (typeof ROWS)[number]): string =>
    row.kcal ? formatKcal(row.value(f)) : formatMacroGrams(row.value(f));
  const cell = (f: Figures | null, row: (typeof ROWS)[number]): ReactElement | null =>
    f === null ? null : (
      <>
        {numberOf(f, row)}
        {/* The unit is in the row's label on a phone, and here aloud and from md. */}
        <span className="max-md:sr-only"> {unitOf(row)}</span>
      </>
    );
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      data-recipe-figures=""
      className={`${inSheet ? `${cardInSheetClass} px-2.5 py-4` : `${cardClass} p-4`} md:p-6`}
    >
      <h3 id={headingId} className="sr-only">
        {t("figures")}
      </h3>
      {stepper ? (
        <Stepper stepper={stepper} scaled={scaled} />
      ) : (
        stepperRoom && <div aria-hidden="true" data-stepper-room="" className={stepperBlock} />
      )}
      {/* On the page from the start, and filled once the stepper is touched: a live region that arrives filled may not be read. */}
      {(stepper || stepperRoom) && (
        <p aria-live="polite" className="sr-only" data-figures-said="">
          {stepper?.touched && whole
            ? t("figuresSaid", {
                heading: wholeHeading,
                kcal: formatKcal(whole.energyKcal),
                protein: formatMacroGrams(whole.proteinG),
                carbs: formatMacroGrams(whole.carbsG),
                fat: formatMacroGrams(whole.fatG),
              })
            : null}
        </p>
      )}
      <table className="w-full table-fixed border-collapse text-base">
        <colgroup>
          <col />
          <col className="w-16 md:w-40" />
          <col className="w-21 md:w-44" />
        </colgroup>
        <thead>
          <tr className="text-sm leading-5 text-ink-muted">
            <td className="pb-2" />
            <th scope="col" className={`${headCell} ${beforeFirst}`}>
              {t("perServing")}
            </th>
            <th scope="col" className={`${headCell} ${beforeSecond}`} data-whole-heading="">
              {wholeHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.macro} data-macro={row.macro} className="border-t border-rule">
              <th scope="row" className="py-2 text-left font-normal text-ink">
                <span className="flex items-center gap-1.5 md:gap-2">
                  <MacroDot macro={row.macro} />
                  <span className="min-w-0 truncate">
                    {labelOf(row.macro)}
                    <span aria-hidden="true" className="text-sm text-ink-muted md:hidden">
                      {" "}
                      {unitOf(row)}
                    </span>
                  </span>
                </span>
              </th>
              <td className={`${figureCell} ${beforeFirst}`}>{cell(perServing, row)}</td>
              <td className={`${figureCell} ${beforeSecond}`}>{cell(whole, row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note}
    </section>
  );
}

/** The stepper's block: the label's row, 44px, then the stepper's, 48px. Its room, empty, has the same height. */
const stepperBlock = "mb-4 h-24";

function Stepper({ stepper, scaled }: { stepper: ServingsStepper; scaled: boolean }): ReactElement {
  const t = useTranslations("recipes.page");
  const atMin = stepper.shown <= 1;
  const atMax = stepper.shown >= MAX_RECIPE_SERVINGS;
  const step = (by: number) => stepper.onStep(Math.min(MAX_RECIPE_SERVINGS, Math.max(1, stepper.shown + by)));
  return (
    <div className={stepperBlock}>
      <div className="flex h-11 items-center justify-between gap-3">
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
        {/* At its limit a button keeps focus and does nothing, so stepping down to 1 never drops focus to the page. */}
        <button
          type="button"
          aria-label={t("fewer")}
          aria-controls={stepper.id}
          aria-disabled={atMin || undefined}
          onClick={() => {
            if (!atMin) step(-1);
          }}
          className={stepperButton}
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
          className={stepperField}
        />
        <button
          type="button"
          aria-label={t("more")}
          aria-controls={stepper.id}
          aria-disabled={atMax || undefined}
          onClick={() => {
            if (!atMax) step(1);
          }}
          className={stepperButton}
        >
          <Icon name="plus" className="size-5" />
        </button>
      </div>
    </div>
  );
}
