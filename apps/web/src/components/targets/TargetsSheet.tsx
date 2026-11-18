"use client";

import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { NativeDateInput } from "@/components/ui/NativeDateInput";
import { labelClass, sectionStart, sectionStartWhenFilled } from "@/components/ui/styles";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useRetainedValue } from "@/hooks/useRetainedValue";
import { deleteTargets, putTargets } from "@/lib/api/targets";
import { getErrorCode } from "@/lib/errors";
import { afterTargetsChange } from "@/lib/invalidation";
import { formatDay, isIsoDate } from "@/lib/localDate";
import type { TargetChange } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactElement } from "react";
import { NotAdviceNote } from "./NotAdviceNote";
import { TargetRangeFields, targetFieldId } from "./TargetRangeFields";
import {
  fieldsOf,
  firstInvalidField,
  parseTargetFields,
  type TargetField,
  type TargetFieldErrors,
  type TargetFieldValues,
} from "./targetForm";
import { inForceOn, removalOf, spanOf, type Removal, type Span } from "./targetLines";

// ---------------------------------------------------------------------------
// TargetsSheet: a dated targets change. "Starts on" (today by default), the
// four fields, a line naming the days the numbers apply to, and the note on
// advice.
//
// The fields open with the user's own targets in force on the date, the ones
// a save changes. A field the user has not typed in follows the date: picking
// another one fills it with the targets in force there. A field they typed in
// keeps what they typed. The fields are where the targets in force show, so
// no line repeats them. The app offers no number of its own: with no targets
// in force the fields are empty.
//
// Picking a date that already has a change switches the sheet to editing
// that change, and the title says so, so nothing is replaced without the
// title naming it. Opened on a change from the Settings list, the date is
// fixed, and the change can be removed while it is not the last one.
// ---------------------------------------------------------------------------

export interface TargetsSheetProps extends FormSheetCallerProps {
  /** The user's today, as the server reads it. */
  today: string;
  /** Every change the user has. */
  changes: readonly TargetChange[];
  /** Opened on this change from the list: its date is fixed and it can be removed. */
  editing?: string;
  /**
   * Where focus goes after a removal, read as the removal lands: the row that
   * opened the sheet leaves the page. The confirmation puts focus there as it
   * closes, and the sheet, closing in the same update, then finds focus
   * outside itself and leaves it.
   */
  focusAfterRemove?: () => HTMLElement | null;
}

type T = ReturnType<typeof useTranslations<"targets.sheet">>;

function spanText(t: T, span: Span): string {
  switch (span.kind) {
    case "between":
      return t("appliesBetween", { date: formatDay(span.date), end: formatDay(span.end) });
    case "day":
      return t("appliesDay", { date: formatDay(span.date) });
    case "from":
      return t("appliesFrom", { date: formatDay(span.date) });
    case "before":
      return t("appliesBefore", { next: formatDay(span.next) });
    case "all":
      return t("appliesAll");
  }
}

function removalText(t: T, removal: Removal | null): string {
  if (removal === null) return "";
  switch (removal.kind) {
    case "between":
      return t("removeBodyBetween", { date: formatDay(removal.date), end: formatDay(removal.end) });
    case "day":
      return t("removeBodyDay", { date: formatDay(removal.date) });
    case "from":
      return t("removeBodyFrom", { date: formatDay(removal.date) });
    case "first":
      return t("removeBodyFirst", { next: formatDay(removal.next) });
  }
}

export function TargetsSheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  today: liveToday,
  changes: liveChanges,
  editing,
  focusAfterRemove,
}: TargetsSheetProps): ReactElement {
  const t = useTranslations("targets.sheet");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const id = useId();
  const dateId = `${id}-date`;

  const [date, setDate] = useState(editing ?? liveToday);
  // The last date that was a date: the fields follow it, and a date being
  // retyped leaves them as they were.
  const [filledFrom, setFilledFrom] = useState(editing ?? liveToday);
  // What the user typed, field by field. A field not in here follows the date.
  const [typed, setTyped] = useState<Partial<TargetFieldValues>>({});
  const [fieldErrors, setFieldErrors] = useState<TargetFieldErrors>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validDate = isIsoDate(date);
  // What the sheet shows, kept from the moment it starts to close: the
  // refetch after a save or a removal lands while it slides out, and would
  // otherwise switch its title, fields and lines mid-exit.
  const changes = useRetainedValue(open ? liveChanges : null) ?? liveChanges;
  const filled = useMemo(() => fieldsOf(inForceOn(changes, filledFrom)), [changes, filledFrom]);
  const values: TargetFieldValues = { ...filled, ...typed };
  // Opened and not changed is clean: the filled numbers are the baseline.
  const { dirty } = useFormDirty(JSON.stringify([date, values]), true);
  const existing = validDate && changes.some((c) => c.effectiveFrom === date);
  const span = validDate ? spanOf(changes, date) : null;

  const remove = useConfirmedDelete<string>({
    copy: (d) => ({
      title: t("removeTitle", { date: formatDay(d) }),
      message: removalText(t, removalOf(changes, d)),
      confirmLabel: t("removeConfirm"),
      busyLabel: t("removing"),
    }),
    run: (d) => deleteTargets(d),
    onDone: () => {
      void afterTargetsChange(client);
      onClose();
    },
    onError: (err) => {
      // The list was out of date: another device removed a change.
      const code = getErrorCode(err);
      if (code === "target_change_not_found" || code === "targets_last_change") void afterTargetsChange(client);
    },
    focusAfter: () => focusAfterRemove?.() ?? null,
  });

  function change(field: TargetField, raw: string): void {
    setTyped((prev) => ({ ...prev, [field]: raw }));
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const parsed = parseTargetFields(values);
    const badDate = !validDate;
    setDateError(badDate ? errors.forCode("invalid_date") : null);
    setFieldErrors(parsed.ok ? {} : parsed.errors);
    if (badDate) {
      focusField(dateId);
      return;
    }
    if (!parsed.ok) {
      const first = firstInvalidField(parsed.errors);
      if (first) focusField(targetFieldId(id, first));
      return;
    }
    // Opened and not changed: the targets on screen are the ones in force,
    // so there is nothing to save. Sending them would add a change with the
    // same numbers on a date that has none of its own.
    if (!dirty) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await putTargets(date, parsed.body);
    } catch (err) {
      if (getErrorCode(err) === "invalid_date") {
        setDateError(errors.forError(err));
        focusField(dateId);
      } else {
        setFormError({ line: errors.forError(err), cause: err });
      }
      setSubmitting(false);
      return;
    }
    void afterTargetsChange(client);
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    onClose();
  }

  const canRemove = editing !== undefined && changes.length > 1;

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={existing ? t("titleExisting", { date: formatDay(date) }) : t("title")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("save")}
      busy={t("saving")}
      // Two fields side by side and a line of dates: wider than the default dialog.
      sheet={{
        panelClassName: "md:max-w-md",
        // While a date can be picked, the title switches to "Targets from {date}",
        // which takes two lines on a phone: its room is kept, so the switch moves nothing.
        titleClassName: editing === undefined ? "max-md:min-h-16" : undefined,
        stacked: remove.dialog,
      }}
      footerStart={canRemove ? { label: t("remove"), onPress: (opener) => remove.open(editing, opener) } : undefined}
    >
      {({ autoFocus }) => (
        <>
          {/* The date, with the one line its error takes, set apart from the fields below. */}
          <div>
            {editing === undefined ? (
              <>
                <label htmlFor={dateId} className={labelClass}>
                  {t("startsOn")}
                </label>
                <NativeDateInput
                  id={dateId}
                  name="effective-from"
                  value={date}
                  onValueChange={(v) => {
                    setDate(v);
                    if (isIsoDate(v)) setFilledFrom(v);
                    setDateError(null);
                  }}
                  required
                  autoFocus={autoFocus}
                  error={dateError}
                />
              </>
            ) : (
              <>
                <p className={labelClass}>{t("startsOn")}</p>
                <p className="text-base text-ink">{formatDay(editing)}</p>
              </>
            )}
          </div>
          <div className={sectionStart}>
            <TargetRangeFields
              idPrefix={id}
              values={values}
              onChange={change}
              errors={fieldErrors}
              autoFocus={editing !== undefined && autoFocus}
            />
          </div>
          {/*
            Under the fields, as tall as what it says: a date picked above it
            changes it, and only what is below it moves. It starts a section
            of its own, 16px under the fields, and empty, while the date is
            not a date, it takes no gap. Announced, so a screen reader hears
            which days the numbers apply to.
          */}
          <p aria-live="polite" data-span="" className={`${sectionStartWhenFilled} text-sm font-medium text-ink`}>
            {span && spanText(t, span)}
          </p>
          <NotAdviceNote className={sectionStart} />
        </>
      )}
    </FormSheet>
  );
}
