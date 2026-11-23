"use client";

import type { EntryFieldError } from "@/components/entries/amount";
import { CountField } from "@/components/entries/CountField";
import { StateChoice } from "@/components/entries/StateChoice";
import { Checkbox } from "@/components/ui/Checkbox";
import { NativeDateInput, dateHintId } from "@/components/ui/NativeDateInput";
import {
  btnText,
  btnWide,
  fieldErrorClass,
  fieldHintClass,
  labelClass,
  lineRoom,
  pairRow,
  sectionTitle,
  subLabelClass,
} from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { formatDayShort } from "@/lib/localDate";
import type { Entry, EntryStatus, ErrorCode } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { isFuture, statusOn, type AddRow } from "./cookDraft";

// ---------------------------------------------------------------------------
// CookServings: "Servings from this batch", the last section of the "log as
// made" sheet, which says which days the batch's servings are on. Top to
// bottom:
//
// - The entry the sheet opened from, as its day and servings, with Eaten or
//   planned. Opened with no entry, a first row of new servings stands in its
//   place: a date, the servings and Eaten or planned. Every row can be
//   removed, that one too.
// - Add servings on another day, which adds such a row under itself, so the
//   button stays where it was pressed and a second tap never lands on a
//   field that slid in under the finger.
// - "Other planned servings of Shakshuka": the plain planned servings of the
//   recipe on the batch's day and the six after, each a checkbox, unticked,
//   under a line that says what a tick does. Last, so the list arriving
//   moves nothing: the days are read as the sheet opens. With none, the
//   heading is absent too. At the most a batch takes, an unticked one is
//   unavailable.
// - One line, which says what the sheet waits for while the batch has no
//   serving, that it holds the most it takes, or what a submit refused.
//
// A day after today holds planned entries only, as everywhere: Eaten is
// unavailable there and a line says why.
// ---------------------------------------------------------------------------

export interface CookServingsProps {
  idPrefix: string;
  recipeName: string;
  today: string | null;
  /** The entry the sheet opened from, and the state chosen for it. */
  opening: { entry: Entry; chosen: EntryStatus | null } | null;
  onOpeningStatus: (status: EntryStatus) => void;
  /** The rows of new servings. With no opening entry the first stands in its place, above Add servings. */
  rows: readonly AddRow[];
  /** The first row still stands above Add servings: it was not removed. */
  firstStands: boolean;
  rowErrors: Record<string, { date?: ErrorCode; servings?: EntryFieldError }>;
  onRow: (id: string, patch: Partial<AddRow>) => void;
  onRemoveRow: (id: string) => void;
  onAddRow: () => void;
  /** Whether the batch can take one more row. */
  canAdd: boolean;
  others: readonly Entry[];
  ticked: ReadonlySet<string>;
  /** Whether one more serving can be ticked. A ticked one can always be unticked. */
  canTick: boolean;
  onTick: (id: string, on: boolean) => void;
  /** What a submit refused about the servings, or null. */
  error: ErrorCode | null;
  /** What the sheet waits for while no day has servings, or null. */
  hint: string | null;
}

export function CookServings(props: CookServingsProps): ReactElement {
  const { idPrefix, recipeName, today, opening, rows, others, ticked, error, hint } = props;
  const t = useTranslations("recipes.cook");
  const tRow = useTranslations("day.row");
  const errorCopy = useErrorCopy();
  const dayOf = (date: string): string => formatDayShort(date, undefined, today ?? undefined);
  const first = props.firstStands ? rows[0] : undefined;
  const later = first ? rows.slice(1) : rows;
  return (
    <section aria-labelledby={`${idPrefix}-servings-title`} data-cook-servings="">
      <h3 id={`${idPrefix}-servings-title`} className={`${sectionTitle} mb-2`}>
        {t("fromBatch")}
      </h3>
      {opening && (
        // Named by its day and servings, so "Eaten or planned" is heard as this serving's.
        <fieldset data-cook-opening="" className="mb-2 min-w-0">
          <legend className="mb-2 text-base text-ink">
            {t("servingOn", {
              day: dayOf(opening.entry.date),
              amount: tRow("servings", { count: opening.entry.servings ?? 0 }),
            })}
          </legend>
          <StateChoice
            id={`${idPrefix}-opening-state`}
            value={statusOn(opening.entry.date, today, opening.chosen)}
            onChange={props.onOpeningStatus}
            future={isFuture(opening.entry.date, today)}
          />
        </fieldset>
      )}
      {first && <ServingsRow {...props} row={first} n={1} standing />}
      <button
        type="button"
        id={`${idPrefix}-add-servings`}
        aria-disabled={!props.canAdd || undefined}
        onClick={() => {
          if (props.canAdd) props.onAddRow();
        }}
        className={`${btnWide} mt-4`}
      >
        {t("addServings")}
      </button>
      {later.map((row, i) => (
        <ServingsRow key={row.id} {...props} row={row} n={i + (first ? 2 : 1)} />
      ))}
      {others.length > 0 && (
        <fieldset data-cook-others="" aria-describedby={`${idPrefix}-others-what`} className="mt-4 min-w-0">
          <legend className={subLabelClass}>{t("others", { name: recipeName })}</legend>
          <p id={`${idPrefix}-others-what`} className="text-sm text-ink-muted">
            {t("othersWhat")}
          </p>
          <ul>
            {others.map((entry) => (
              <li key={entry.id} className="border-b border-rule last:border-b-0">
                <Checkbox
                  id={`${idPrefix}-other-${entry.id}`}
                  checked={ticked.has(entry.id)}
                  disabled={!props.canTick && !ticked.has(entry.id)}
                  onChange={(on) => props.onTick(entry.id, on)}
                  className="flex min-h-12 items-center gap-3 py-2 text-base text-ink"
                >
                  <span className="min-w-0 break-words">
                    {t("servingOn", {
                      day: dayOf(entry.date),
                      amount: tRow("servings", { count: entry.servings ?? 0 }),
                    })}
                  </span>
                </Checkbox>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <p
        id={`${idPrefix}-entries`}
        tabIndex={-1}
        className={`${error ? fieldErrorClass : fieldHintClass} ${lineRoom} outline-hidden`}
      >
        {error ? errorCopy.forCode(error) : hint}
      </p>
    </section>
  );
}

/** One row of new servings: its date, its servings and Eaten or planned, under a name of its own. */
function ServingsRow({
  idPrefix,
  today,
  row,
  n,
  standing = false,
  rowErrors,
  onRow,
  onRemoveRow,
}: CookServingsProps & { row: AddRow; n: number; standing?: boolean }): ReactElement {
  const t = useTranslations("recipes.cook");
  const tSheet = useTranslations("entries.sheet");
  const errorCopy = useErrorCopy();
  const id = `${idPrefix}-row-${row.id}`;
  const refused = rowErrors[row.id] ?? {};
  const future = isFuture(row.date, today);
  const dateError = refused.date ? errorCopy.forCode(refused.date) : null;
  return (
    <fieldset data-cook-row={row.id} className={`min-w-0 ${standing ? "" : "mt-3 border-t border-rule pt-3"}`}>
      <legend className="sr-only">{t("rowName", { n })}</legend>
      {/* More room than a pair keeps by default: the line under the date holds words on a future day. */}
      <div className={`${pairRow} max-md:gap-4`}>
        <div className="min-w-0">
          <label htmlFor={`${id}-date`} className={labelClass}>
            {tSheet("date")}
          </label>
          <NativeDateInput
            id={`${id}-date`}
            value={row.date}
            onValueChange={(date) => onRow(row.id, { date })}
            error={dateError}
            // Why Eaten is unavailable, under the date that makes it so.
            hint={future ? tSheet("futureHint") : null}
          />
        </div>
        <CountField
          id={`${id}-servings`}
          of="servings"
          value={row.servings}
          onChange={(servings) => onRow(row.id, { servings })}
          error={refused.servings}
          autoFocus={false}
        />
      </div>
      <div className="mt-3">
        <StateChoice
          id={`${id}-state`}
          value={statusOn(row.date, today, row.chosen)}
          onChange={(chosen) => onRow(row.id, { chosen })}
          future={future}
          reason={{ id: dateHintId(`${id}-date`), shown: dateError === null }}
        />
      </div>
      <button type="button" onClick={() => onRemoveRow(row.id)} className={btnText}>
        {t("removeRow")}
      </button>
    </fieldset>
  );
}
