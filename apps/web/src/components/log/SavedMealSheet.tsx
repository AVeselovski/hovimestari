"use client";

import { FigureFields, figureFieldId } from "@/components/entries/FigureFields";
import { StateChoice } from "@/components/entries/StateChoice";
import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import {
  chip,
  chipOff,
  chipOn,
  chipRowWrapping,
  fieldErrorClass,
  fieldHintClass,
  inputClass,
  labelClass,
  lineRoom,
  pairRow,
  sectionTitle,
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
import { MEAL_ORDER, fieldOfCode, firstRefused, mealFieldsOf, readMeal, type MealField } from "./mealForm";
import { bringUpToDate, type MealSend } from "./mealSends";
import { useFormFields } from "./useFormFields";

// ---------------------------------------------------------------------------
// SavedMealSheet: a saved meal's name, where it comes from and its figures
// for one meal, stacked on the log sheet.
//
// - New: "Save and log" (or "Save and add to plan" while Planned is chosen)
//   saves the meal and logs one of it in one request, then both sheets close
//   in one update. "Save meal", in the footer's own row, saves it without
//   logging and leaves the log sheet open. The ids of the meal and of its
//   entry are made when the sheet opens and kept across every retry, so
//   "Save meal" that timed out, then "Save and log", makes one meal. A press
//   after a send that could not confirm, with the form changed since, first
//   brings what that send may have written up to date (mealSends.ts).
// - Edit: the meal's own values, no state choice, "Save meal". Its planned
//   entries from today on take the new figures.
// - "From (optional)" opens empty. The user's sources sit under it as chips:
//   a chip fills the field, and the chip that matches it is in the accent.
//   With no sources yet, a hint under the field says what it is for.
// - The figures' shared line says where to copy them from until one is
//   refused (`FigureFields`).
// - A new meal asks Eaten or planned first, then Name, From and the figures.
//   From `md` Eaten or planned and Name share a row, and From takes the full
//   width under them. An edit gives Name and From the full width, one under
//   the other. The chips under From scroll sideways on a phone and wrap from
//   `md`, and a chip longer than its row is cut at the row's width.
// - Enter in Name moves to Calories.
// ---------------------------------------------------------------------------

export interface SavedMealSheetProps extends FormSheetCallerProps {
  /** The meal to edit, or none for a new one. */
  meal?: SavedMeal;
  /** A name to start a new meal from, such as the text the search held. */
  initialName: string;
  /** The log sheet's date, which "Save and log" logs to. */
  date: string;
  /** The sources of the user's meals, offered as chips. */
  sources: readonly string[];
  actions: Pick<EntryActions, "saveAndLog" | "withdrawAdd" | "holding">;
  /** "Save and log" was answered: close both sheets, then `done.announce()`. */
  onLogged: (done: SaveAndLogDone) => void;
  /** A meal was saved without logging, new or edited. */
  onSavedMeal: (meal: SavedMeal) => void;
  /** The meal being edited is gone. */
  onGone: (id: string) => void;
}

const SAVE_ONLY = "save";

export function SavedMealSheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  meal,
  initialName,
  date,
  sources,
  actions,
  onLogged,
  onSavedMeal,
  onGone,
}: SavedMealSheetProps): ReactElement {
  const t = useTranslations("log.mealSheet");
  const errorCopy = useErrorCopy();
  const failureLine = useFailureLine("form");
  const client = useQueryClient();
  const labels = useAmountLabels();
  const offline = useKnownOffline();
  const { today } = useToday();
  const id = useId();
  const editing = meal !== undefined;

  const [initial] = useState(() => mealFieldsOf(meal, initialName));
  const { fields, errors, setErrors, change } = useFormFields<MealField>(initial);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<EntryStatus | null>(null);
  // Made once per open and kept across retries, so a repeat applies once.
  const [mealId, setMealId] = useState(() => newId());
  const [entryId, setEntryId] = useState(() => newId());
  // What a send whose answer never came may have written under these ids (mealSends.ts).
  const held = useRef<MealSend | null>(null);

  const future = today !== null && date > today;
  const status: EntryStatus = future ? "planned" : (chosen ?? "eaten");
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial) || chosen !== null;
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
    const entryOf = (entry: string) => ({ id: entry, date, status, count: 1, figures: body.figures });
    const next: MealSend = { meal: body, entry: saveOnly ? null : entryOf(entryId) };
    const fresh = await bringUpToDate(held, next, {
      putMeal: async (edit) => {
        const saved = await updateSavedMeal(mealId, edit);
        void afterSavedMealChange(client, saved);
        return saved;
      },
      dropEntry: (entry) => actions.withdrawAdd(entry.id, entry.date),
    });
    const entry = fresh ? newId() : entryId;
    if (fresh) setEntryId(entry);
    const sent: MealSend = { meal: body, entry: saveOnly ? null : entryOf(entry) };
    try {
      if (saveOnly) {
        const saved = await createSavedMeal({ id: mealId, ...body });
        // In the open list before this sheet closes: the list holds its rows once it can be pressed again.
        await afterSavedMealCreated(client, saved);
        return saved;
      }
      const again = (): AddRequest => ({
        body: { kind: "saved_meal", id: newId(), date, status, savedMealId: mealId, count: 1 },
        name: body.name,
        amount: labels.meals(1),
        again,
      });
      return await actions.saveAndLog({
        body: { meal: { id: mealId, ...body }, entry: { id: entry, date, status, count: 1 } },
        again,
      });
    } catch (err) {
      if (!(err instanceof OfflineError) && unconfirmed(err)) {
        // It may have landed: the next press starts from it. A "Save and log" reads its day
        // and the lists again on the add path (useAddActions), a "Save meal" the lists here.
        held.current = sent;
        if (saveOnly) void afterSavedMealCreated(client);
      }
      throw err;
    }
  }

  async function handleSubmit(mode?: string): Promise<void> {
    if (saving || actions.holding) return;
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
      if (editing) {
        const saved = await updateSavedMeal(meal.id, read.body);
        void afterSavedMealChange(client, saved);
        onSavedMeal(saved);
      } else {
        const done = await sendNew(read.body, mode === SAVE_ONLY);
        if (done === "held") {
          setSaving(false);
          return;
        }
        if ("announce" in done) {
          onSaved?.();
          // Both sheets close in this one update: never the log sheet alone.
          onLogged(done);
          onClose();
          return;
        }
        onSavedMeal(done);
      }
    } catch (err) {
      setSaving(false);
      if (editing && getErrorCode(err) === "saved_meal_not_found") onGone(meal.id);
      else failed(err);
      return;
    }
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    onClose();
  }

  // The chips say what the field is for once there are sources. Until then the hint does, in two lines of room.
  const sourceLine = errors.source ? errorCopy.forCode(errors.source) : sources.length > 0 ? null : t("sourceHint");
  const matching = (s: string) => s.toLocaleLowerCase("fi") === fields.source.trim().toLocaleLowerCase("fi");
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? t("titleEdit") : t("titleNew")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={saving}
      held={actions.holding}
      onSubmit={handleSubmit}
      formError={formError}
      idle={editing ? t("saveMeal") : status === "planned" ? t("saveAndPlan") : t("saveAndLog")}
      busy={t("saving")}
      footerStart={
        editing ? undefined : { label: t("saveMeal"), submit: SAVE_ONLY, busy: t("saving"), tone: "neutral" }
      }
      sheet={{ size: "tall", panelClassName: "md:max-w-lg" }}
    >
      {({ autoFocus }) => (
        <>
          {/* A new meal asks Eaten or planned first, as the entry and estimate sheets do, so the
              choice is on a phone's first screen. Name, From and the figures follow. From md
              Eaten or planned and Name share a row for a new meal. From and its chips take the
              full width under them, and an edit's Name takes the full width too, so a long
              source chip has the whole row. */}
          <div className={editing ? "space-y-3" : pairRow}>
            {!editing && <StateChoice id={`${id}-state`} value={status} onChange={setChosen} future={future} />}
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
              {sources.length > 0 && (
                <div
                  role="group"
                  aria-label={t("sources")}
                  data-meal-sources=""
                  className={`${chipRowWrapping} mt-1.5`}
                >
                  {sources.map((s) => (
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
                className={`${errors.source ? fieldErrorClass : fieldHintClass} ${lineRoom(sources.length > 0 ? 1 : 2)}`}
              >
                {sourceLine}
              </p>
            </div>
          </div>
          <div>
            <h3 className={`${sectionTitle} mb-2`}>{t("perMeal")}</h3>
            <FigureFields idPrefix={id} values={fields} errors={errors} onChange={change} hint={t("perMealHint")} />
          </div>
        </>
      )}
    </FormSheet>
  );
}
