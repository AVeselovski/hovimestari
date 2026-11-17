"use client";

import { EstimateFields, estimateFieldId } from "@/components/entries/EstimateFields";
import { StateChoice } from "@/components/entries/StateChoice";
import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import type { AddDone, EntryActions } from "@/hooks/entryActions";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { newId } from "@/lib/newId";
import type { AddEntryBody, EntryStatus } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import {
  ESTIMATE_ORDER,
  fieldOfCode,
  firstRefused,
  readEstimate,
  type EstimateFormField,
  type EstimateFormFields,
} from "./mealForm";
import { useFormFields } from "./useFormFields";

// ---------------------------------------------------------------------------
// EstimateSheet: "Add an estimate", stacked on the log sheet, for a meal that
// cannot be weighed. Eaten or planned, then its name, its four figures as
// typed and a note. "Save estimate" logs it to the log sheet's date with the
// id made when the sheet opened, kept across retries, so a retry after a
// timeout adds one entry. Success closes both sheets in one update and the
// toast shows once they have slid out. The day marks it as an estimate.
// ---------------------------------------------------------------------------

export interface EstimateSheetProps extends FormSheetCallerProps {
  /** A name to start from, such as the text the search held. */
  initialName: string;
  /** The log sheet's date. */
  date: string;
  actions: Pick<EntryActions, "add" | "holding">;
  /** The add was answered: close both sheets, then `done.announce()`. */
  onLogged: (done: AddDone) => void;
}

export function EstimateSheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  initialName,
  date,
  actions,
  onLogged,
}: EstimateSheetProps): ReactElement {
  const t = useTranslations("log.estimateSheet");
  const failureLine = useFailureLine("form");
  const { today } = useToday();
  const id = useId();

  const [initial] = useState<EstimateFormFields>(() => ({
    name: initialName,
    energy: "",
    protein: "",
    carbs: "",
    fat: "",
    note: "",
  }));
  const { fields, errors, setErrors, change } = useFormFields<EstimateFormField>(initial);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<EntryStatus | null>(null);
  // Made once per open and kept across retries, so a repeat adds once.
  const [entryId, setEntryId] = useState(() => newId());

  const future = today !== null && date > today;
  const status: EntryStatus = future ? "planned" : (chosen ?? "eaten");
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial) || chosen !== null;

  async function handleSubmit(): Promise<void> {
    if (saving || actions.holding) return;
    setFormError(null);
    const read = readEstimate(fields);
    if (!read.ok) {
      setErrors(read.errors);
      focusField(estimateFieldId(id, firstRefused(ESTIMATE_ORDER, read.errors) ?? "name"));
      return;
    }
    setErrors({});
    const bodyFor = (entry: string): AddEntryBody => ({
      kind: "estimate",
      id: entry,
      date,
      status,
      name: read.name,
      figures: read.figures,
      note: read.note,
    });
    const request = (entry: string) => ({
      body: bodyFor(entry),
      name: read.name,
      amount: "",
      again: () => request(newId()),
    });
    setSaving(true);
    try {
      const done = await actions.add(request(entryId));
      if (done === "held") {
        setSaving(false);
        return;
      }
      onSaved?.();
      // Both sheets close in this one update: never the log sheet alone.
      onLogged(done);
      onClose();
    } catch (err) {
      setSaving(false);
      const code = getErrorCode(err);
      const field = fieldOfCode(code, ESTIMATE_ORDER);
      if (field && code) {
        setErrors({ [field]: code });
        focusField(estimateFieldId(id, field));
        return;
      }
      // An id another account holds: the next try makes a new one.
      if (code === "entry_id_taken") setEntryId(newId());
      setFormError({ line: failureLine(err), cause: err });
    }
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={saving}
      held={actions.holding}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("save")}
      busy={t("saving")}
      sheet={{ size: "tall", panelClassName: "md:max-w-lg" }}
    >
      {({ autoFocus }) => (
        <>
          {/* Eaten or planned first, as in the entry sheet, so the name, the figures and the
              state are on a phone's first screen, the optional note under them. From md it
              shares the name's row, so the dialog shows the whole form on a laptop. */}
          <EstimateFields
            idPrefix={id}
            fields={fields}
            errors={errors}
            onChange={change}
            autoFocus={autoFocus}
            besideName={<StateChoice id={`${id}-state`} value={status} onChange={setChosen} future={future} />}
          />
        </>
      )}
    </FormSheet>
  );
}
