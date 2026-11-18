"use client";

import { focusField } from "@/components/form/focus";
import { SheetDescription } from "@/components/ui/BottomSheet";
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
import { useId, useState, type ReactElement } from "react";
import { NotAdviceNote } from "./NotAdviceNote";
import { TargetRangeFields, targetFieldId } from "./TargetRangeFields";
import {
  EMPTY_TARGET_FIELDS,
  fieldsOf,
  firstInvalidField,
  parseTargetFields,
  type TargetField,
  type TargetFieldErrors,
  type TargetFieldValues,
} from "./targetForm";
import { removalOf, spanOf, type Removal, type Span } from "./targetLines";

// ---------------------------------------------------------------------------
// TargetsSheet: a dated targets change. The four fields, a line naming the
// days the numbers apply to, and the note on advice.
//
// Opened on a change from the Settings list (`editing`), the sheet is "Edit
// targets", with "Starting on {date}" under the title as the dialog's
// description: the date is fixed. The fields open with that change's own
// targets, taken once as the sheet mounts: a refetch that lands while it is
// open moves nothing. Saved untouched, it sends nothing. The change can be
// removed while it is not the last one.
//
// Opened from "Change targets", the sheet sets new targets from a date it
// lets the reader pick, today by default. The fields open empty and stay
// empty whatever date is picked. The app offers no number, not even the
// user's own. The title never changes: a date that already has a change of
// its own is named in the line under the fields, which says that saving
// replaces it, so nothing is replaced without the sheet saying so.
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

/**
 * The line under the fields. On a picked date that already has a change, it
 * first says that saving replaces it, naming the date only where the span
 * does not already name it.
 * Two whole sentences, each one catalog entry, joined with a space: parts of
 * one sentence are never joined.
 */
function lineText(t: T, date: string, span: Span, replaces: boolean): string {
  const applies = spanText(t, span);
  if (!replaces) return applies;
  const named = span.kind === "between" || span.kind === "day" || span.kind === "from";
  const notice = named ? t("replacesThisDate") : t("replacesNamed", { date: formatDay(date) });
  return `${notice} ${applies}`;
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
  // Editing: the change's own targets, read once from the list it opened on.
  // New targets: empty.
  const [values, setValues] = useState<TargetFieldValues>(() =>
    editing === undefined
      ? EMPTY_TARGET_FIELDS
      : fieldsOf(liveChanges.find((c) => c.effectiveFrom === editing) ?? null),
  );
  const [fieldErrors, setFieldErrors] = useState<TargetFieldErrors>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validDate = isIsoDate(date);
  // What the sheet shows, kept from the moment it starts to close: the
  // refetch after a save or a removal lands while it slides out, and would
  // otherwise switch its title and lines mid-exit.
  const changes = useRetainedValue(open ? liveChanges : null) ?? liveChanges;
  // Opened and not changed is clean: an edited change's own numbers are the baseline.
  const { dirty } = useFormDirty(JSON.stringify([date, values]), true);
  // New targets on a date that already has a change replace it: the line under the fields says so.
  const replaces = editing === undefined && validDate && changes.some((c) => c.effectiveFrom === date);
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
    setValues((prev) => ({ ...prev, [field]: raw }));
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
    // Opened on a change and not changed: the numbers on screen are already
    // saved, so there is nothing to send. Only an edit gets here untouched:
    // new targets open empty, and an empty field fails above.
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
      title={editing === undefined ? t("title") : t("titleEdit")}
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
        // An edit's fixed date, under the title in the fixed header, and the dialog's description.
        headerNote:
          editing === undefined ? undefined : (
            <SheetDescription className="text-base text-ink-muted">
              {t("startingOn", { date: formatDay(editing) })}
            </SheetDescription>
          ),
        stacked: remove.dialog,
      }}
      footerStart={canRemove ? { label: t("remove"), onPress: (opener) => remove.open(editing, opener) } : undefined}
    >
      {({ autoFocus }) => (
        <>
          {/* New targets: the date, with the one line its error takes, set apart from the fields below. */}
          {editing === undefined && (
            <div>
              <label htmlFor={dateId} className={labelClass}>
                {t("startsOn")}
              </label>
              <NativeDateInput
                id={dateId}
                name="effective-from"
                value={date}
                onValueChange={(v) => {
                  setDate(v);
                  setDateError(null);
                }}
                required
                autoFocus={autoFocus}
                error={dateError}
              />
            </div>
          )}
          <div className={editing === undefined ? sectionStart : undefined}>
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
            not a date, it takes no gap. On a picked date that already has
            targets, it says first that saving replaces them. Announced, so a
            screen reader hears which days the numbers apply to.
          */}
          <p aria-live="polite" data-span="" className={`${sectionStartWhenFilled} text-sm font-medium text-ink`}>
            {span && lineText(t, date, span, replaces)}
          </p>
          <NotAdviceNote className={sectionStart} />
        </>
      )}
    </FormSheet>
  );
}
