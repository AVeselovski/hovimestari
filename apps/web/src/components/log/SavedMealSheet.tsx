"use client";

import { FigureFields, figureFieldId } from "@/components/entries/FigureFields";
import { StateChoice } from "@/components/entries/StateChoice";
import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import {
  btnText,
  chip,
  chipOff,
  chipOn,
  fieldErrorClass,
  fieldHintClass,
  formStack,
  inputClass,
  labelClass,
  lineRoom,
  pairRow,
  sectionStart,
  sectionTitle,
  sheetChipRowWrapping,
} from "@/components/ui/styles";
import type { AddRequest, EntryActions, SaveAndLogDone } from "@/hooks/entryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useToday } from "@/hooks/useToday";
import { createSavedMeal, updateSavedMeal } from "@/lib/api/savedMeals";
import { getErrorCode } from "@/lib/errors";
import { OfflineError, unconfirmed } from "@/lib/failure";
import { afterSavedMealChange, afterSavedMealCreated } from "@/lib/invalidation";
import { newId } from "@/lib/newId";
import type { EntryStatus, SavedMeal, SavedMealEditBody } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactElement } from "react";
import { useAmountLabels } from "./amountLabel";
import { sortedSources } from "./mealFilter";
import { MEAL_ORDER, fieldOfCode, firstRefused, mealFieldsOf, readMeal, type MealField } from "./mealForm";
import { bringUpToDate, type MealSend } from "./mealSends";
import { useFormFields } from "./useFormFields";
import type { ArchiveOutcome } from "./useMealActions";
import { useSavedMealDelete } from "./useSavedMealDelete";

// ---------------------------------------------------------------------------
// SavedMealSheet: a saved meal's name, where it comes from and its figures
// for one meal. Stacked on the log sheet, which passes `logging`, or on its
// own on the Recipes tab, which does not.
//
// - New, with `logging`: "Save and log" (or "Save and add to plan" while Planned is chosen)
//   saves the meal and logs one of it in one request, then both sheets close
//   in one update. "Save meal", in the footer's own row, saves it without
//   logging and leaves the log sheet open. The ids of the meal and of its
//   entry are made when the sheet opens and kept across every retry, so
//   "Save meal" that timed out, then "Save and log", makes one meal. A press
//   after a send that could not confirm, with the form changed since, first
//   brings what that send may have written up to date (mealSends.ts).
// - New, without `logging`: save only. No Eaten or planned, and "Save meal"
//   is the one submit.
// - Edit: the meal's own values, no state choice, "Save meal". Its planned
//   entries from today on take the new figures. "Delete" in the footer asks
//   first, in a confirmation stacked on this sheet (`useSavedMealDelete`).
//   On a delete this sheet closes itself, then tells the host, as every
//   form sheet with a Delete does.
// - `archive`, which only the Recipes tab passes: "Archive meal" or
//   "Restore meal" at the end of the form. The button turns in place, with
//   focus kept on it. The sheet awaits the answer and keeps the meal's
//   archived state itself, and a failure shows on its own error line.
// - Writes wait while the app asks the server for today
//   (`useToday().holding`), and Save and Delete also wait while an archive
//   or restore runs.
// - "From (optional)" opens empty. The user's sources sit under it as chips:
//   a chip fills the field, and the chip that matches it is in the accent.
//   With no sources yet, a hint under the field says what it is for. A chip
//   never leaves while the sheet is open: archiving the last meal from a
//   source would otherwise take its chip row away and pull the form up.
// - The figures' shared line says where to copy them from until one is
//   refused (`FigureFields`).
// - A new meal asks Eaten or planned first, then Name, From and the figures.
//   From `md` Eaten or planned and Name share a row, and From takes the full
//   width under them. An edit gives Name and From the full width, one under
//   the other. The chips under From scroll sideways on a phone and wrap from
//   `md`, and a chip longer than its row is cut at the row's width.
// - Enter in Name moves to Calories.
// ---------------------------------------------------------------------------

/** A new meal. */
export interface NewSavedMeal {
  kind: "new";
  /** A name to start from, such as the text the search held. */
  initialName: string;
  /** What the meal needs to be saved and logged in one press. Left out, the sheet saves only. */
  logging?: MealSheetLogging;
}

/** A meal to edit. */
export interface EditSavedMeal {
  kind: "edit";
  meal: SavedMeal;
  /** Archive or restore from the edit form. Only where no meal view offers it. */
  archive?: MealSheetArchive;
  /** The meal is gone, deleted on another device. */
  onGone: (id: string) => void;
  /** The meal was deleted from this sheet, which has closed itself. The lists have dropped it. */
  onDeleted?: (id: string) => void;
  /**
   * Where focus goes after a delete, read while the opener is still on the
   * page: a control that stays, such as the next row. Default: none, and the
   * sheet underneath takes it.
   */
  focusAfterDelete?: () => HTMLElement | null;
}

export type SavedMealSheetProps = FormSheetCallerProps &
  (NewSavedMeal | EditSavedMeal) & {
    /** The sources of the user's meals, offered as chips. */
    sources: readonly string[];
    /** A meal was saved without logging, new or edited. The lists already hold it. */
    onSavedMeal?: (meal: SavedMeal) => void;
  };

/** The log sheet's part in a new meal: its day, its writes and what happens after a log. */
export interface MealSheetLogging {
  /** The log sheet's date, which "Save and log" logs to. */
  date: string;
  actions: Pick<EntryActions, "saveAndLog" | "withdrawAdd">;
  /** "Save and log" was answered: close both sheets, then `done.announce()`. */
  onLogged: (done: SaveAndLogDone) => void;
}

/** Archive or restore, from the edit form. */
export interface MealSheetArchive {
  /** An archive or restore runs. */
  busy: boolean;
  /** Archives or restores the meal, and answers the meal as it now is or the failure to show. */
  set: (archived: boolean) => Promise<ArchiveOutcome>;
}

const SAVE_ONLY = "save";

export function SavedMealSheet(props: SavedMealSheetProps): ReactElement {
  const { open, returnFocusTo, onClose, onSaved, sources, onSavedMeal } = props;
  const edit = props.kind === "edit" ? props : null;
  const meal = edit?.meal;
  const logging = props.kind === "new" ? props.logging : undefined;
  const archive = edit?.archive;
  const t = useTranslations("log.mealSheet");
  const tMeal = useTranslations("log.meal");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const failureLine = useFailureLine("form");
  const client = useQueryClient();
  const labels = useAmountLabels();
  const offline = useKnownOffline();
  const { today, holding } = useToday();
  const id = useId();
  const editing = meal !== undefined;
  const date = logging?.date ?? null;
  // Save and Delete wait while the app asks for today, and while an archive or restore runs.
  const waits = holding || (archive?.busy ?? false);

  const [initial] = useState(() => mealFieldsOf(meal, props.kind === "new" ? props.initialName : ""));
  // Every source this open has offered: new ones join, none leaves.
  const [chips, setChips] = useState<readonly string[]>(sources);
  if (sources.some((s) => !chips.includes(s))) setChips(sortedSources([...chips, ...sources]));
  const { fields, errors, setErrors, change } = useFormFields<MealField>(initial);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  // The meal as it now is, after an archive or restore from this sheet.
  const [archived, setArchived] = useState(meal?.archived ?? false);
  const [chosen, setChosen] = useState<EntryStatus | null>(null);
  // Made once per open and kept across retries, so a repeat applies once.
  const [mealId, setMealId] = useState(() => newId());
  const [entryId, setEntryId] = useState(() => newId());
  // What a send whose answer never came may have written under these ids (mealSends.ts).
  const held = useRef<MealSend | null>(null);

  const future = today !== null && date !== null && date > today;
  const status: EntryStatus = future ? "planned" : (chosen ?? "eaten");
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial) || chosen !== null;

  const remove = useSavedMealDelete({
    onDone: (gone) => {
      onClose();
      edit?.onDeleted?.(gone.id);
    },
    focusAfter: () => edit?.focusAfterDelete?.() ?? null,
  });
  const fieldId = (field: MealField) =>
    field === "name" || field === "source" ? `${id}-${field}` : figureFieldId(id, field);

  /** A failure no field owns, or a field's refusal from the server. */
  function failed(err: unknown): void {
    const code = getErrorCode(err);
    const field = fieldOfCode(code, MEAL_ORDER);
    if (field && code) {
      setErrors({ [field]: code });
      focusField(fieldId(field));
      return;
    }
    // An id another account holds: the next try makes new ones, under which nothing is held.
    if (code === "saved_meal_id_taken") {
      setMealId(newId());
      held.current = null;
    }
    if (code === "entry_id_taken") setEntryId(newId());
    setFormError({ line: failureLine(err), cause: err });
  }

  /** A new meal: brings an earlier unconfirmed send up to date, then saves, and logs unless `saveOnly`. */
  async function sendNew(body: SavedMealEditBody, saveOnly: boolean): Promise<SaveAndLogDone | SavedMeal | "held"> {
    // Without logging there is no day, and every send saves only.
    const logTo = saveOnly ? null : logging;
    const entryOf = (day: string, entry: string) => ({ id: entry, date: day, status, count: 1, figures: body.figures });
    const next: MealSend = { meal: body, entry: logTo ? entryOf(logTo.date, entryId) : null };
    const fresh = await bringUpToDate(held, next, {
      putMeal: async (edit) => {
        const saved = await updateSavedMeal(mealId, edit);
        void afterSavedMealChange(client, saved);
        return saved;
      },
      // Only a send with an entry holds one, and only the log sheet sends one.
      dropEntry: (entry) => logging?.actions.withdrawAdd(entry.id, entry.date) ?? Promise.resolve(false),
    });
    const entry = fresh ? newId() : entryId;
    if (fresh) setEntryId(entry);
    const sent: MealSend = { meal: body, entry: logTo ? entryOf(logTo.date, entry) : null };
    try {
      if (!logTo) {
        const saved = await createSavedMeal({ id: mealId, ...body });
        // In the open list before this sheet closes: the list holds its rows once it can be pressed again.
        await afterSavedMealCreated(client, saved);
        return saved;
      }
      const again = (): AddRequest => ({
        body: { kind: "saved_meal", id: newId(), date: logTo.date, status, savedMealId: mealId, count: 1 },
        name: body.name,
        amount: labels.meals(1),
        again,
      });
      return await logTo.actions.saveAndLog({
        body: { meal: { id: mealId, ...body }, entry: { id: entry, date: logTo.date, status, count: 1 } },
        again,
      });
    } catch (err) {
      if (!(err instanceof OfflineError) && unconfirmed(err)) {
        // It may have landed: the next press starts from it. A "Save and log" reads its day
        // and the lists again on the add path (useAddActions), a "Save meal" the lists here.
        held.current = sent;
        if (!logTo) void afterSavedMealCreated(client);
      }
      throw err;
    }
  }

  async function handleSubmit(mode?: string): Promise<void> {
    if (saving || waits) return;
    setFormError(null);
    const read = readMeal(fields);
    if (!read.ok) {
      setErrors(read.errors);
      focusField(fieldId(firstRefused(MEAL_ORDER, read.errors) ?? "name"));
      return;
    }
    setErrors({});
    if (offline) {
      setFormError({ line: failureLine(new OfflineError()), cause: new OfflineError() });
      return;
    }
    setSaving(true);
    try {
      if (meal) {
        const saved = await updateSavedMeal(meal.id, read.body);
        void afterSavedMealChange(client, saved);
        onSavedMeal?.(saved);
      } else {
        const done = await sendNew(read.body, mode === SAVE_ONLY || !logging);
        if (done === "held") {
          setSaving(false);
          return;
        }
        if ("announce" in done) {
          onSaved?.();
          // Both sheets close in this one update: never the log sheet alone.
          logging?.onLogged(done);
          onClose();
          return;
        }
        onSavedMeal?.(done);
      }
    } catch (err) {
      setSaving(false);
      if (edit && getErrorCode(err) === "saved_meal_not_found") edit.onGone(edit.meal.id);
      else failed(err);
      return;
    }
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    onClose();
  }

  /** Archives or restores the meal, then turns the button, or shows why it could not. */
  async function toggleArchive(): Promise<void> {
    if (!archive || waits || saving) return;
    setFormError(null);
    const outcome = await archive.set(!archived);
    if (outcome.ok) setArchived(outcome.meal.archived);
    else if (outcome.failure !== null) setFormError({ line: outcome.failure, cause: null });
  }

  // The chips say what the field is for once there are sources. Until then the hint does.
  const sourceLine = errors.source ? errorCopy.forCode(errors.source) : chips.length > 0 ? null : t("sourceHint");
  const matching = (s: string) => s.toLocaleLowerCase("fi") === fields.source.trim().toLocaleLowerCase("fi");
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? t("titleEdit") : t("titleNew")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={saving}
      held={waits}
      onSubmit={handleSubmit}
      formError={formError}
      idle={editing || !logging ? t("saveMeal") : status === "planned" ? t("saveAndPlan") : t("saveAndLog")}
      busy={t("saving")}
      footerStart={
        meal
          ? { label: tCommon("delete"), onPress: (opener) => remove.open(meal, opener) }
          : logging
            ? { label: t("saveMeal"), submit: SAVE_ONLY, busy: t("saving"), tone: "neutral" }
            : undefined
      }
      sheet={{ panelClassName: "md:max-w-lg", stacked: remove.dialog }}
    >
      {({ autoFocus }) => (
        <>
          {/* A new meal asks Eaten or planned first, as the entry and estimate sheets do, so the
              choice is on a phone's first screen. Name, From and the figures follow. From md
              Eaten or planned and Name share a row for a new meal. From and its chips take the
              full width under them, and an edit's Name takes the full width too, so a long
              source chip has the whole row. */}
          <div className={editing || !logging ? formStack : pairRow}>
            {!editing && logging && (
              <StateChoice id={`${id}-state`} value={status} onChange={setChosen} future={future} />
            )}
            <Field
              id={fieldId("name")}
              name="name"
              label={t("name")}
              autoComplete="off"
              enterKeyHint="next"
              autoFocus={autoFocus}
              value={fields.name}
              onChange={(e) => change("name", e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                focusField(fieldId("energy"));
              }}
              error={errors.name ? errorCopy.forCode(errors.name) : null}
            />
            <div className="md:col-span-2">
              <label htmlFor={fieldId("source")} className={labelClass}>
                {t("source")}
              </label>
              <input
                id={fieldId("source")}
                name="source"
                autoComplete="off"
                enterKeyHint="next"
                value={fields.source}
                onChange={(e) => change("source", e.target.value)}
                aria-invalid={errors.source ? true : undefined}
                aria-describedby={`${fieldId("source")}-line`}
                className={inputClass}
              />
              {chips.length > 0 && (
                <div
                  role="group"
                  aria-label={t("sources")}
                  data-meal-sources=""
                  className={`${sheetChipRowWrapping} mt-1.5`}
                >
                  {chips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={matching(s)}
                      onClick={() => change("source", s)}
                      title={s}
                      className={`${chip} ${matching(s) ? chipOn : chipOff}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p
                id={`${fieldId("source")}-line`}
                className={`${errors.source ? fieldErrorClass : fieldHintClass} ${lineRoom}`}
              >
                {sourceLine}
              </p>
            </div>
          </div>
          <div className={sectionStart}>
            <h3 className={`${sectionTitle} mb-2`}>{t("perMeal")}</h3>
            <FigureFields idPrefix={id} values={fields} errors={errors} onChange={change} hint={t("perMealHint")} />
          </div>
          {archive && (
            <div data-meal-archive="" className={sectionStart}>
              {/* One button that turns in place, so focus stays on it from Archive to Restore and back. */}
              <button
                type="button"
                aria-disabled={waits || saving || undefined}
                aria-busy={archive.busy || undefined}
                onClick={() => void toggleArchive()}
                className={btnText}
              >
                {archived ? tMeal("restore") : tMeal("archive")}
              </button>
            </div>
          )}
        </>
      )}
    </FormSheet>
  );
}
