"use client";

import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { NativeDateInput } from "@/components/ui/NativeDateInput";
import { labelClass } from "@/components/ui/styles";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useRetainedValue } from "@/hooks/useRetainedValue";
import { deleteTargets, putTargets } from "@/lib/api/targets";
import { getErrorCode } from "@/lib/errors";
import { afterTargetsChange } from "@/lib/invalidation";
import { formatDay, isIsoDate } from "@/lib/localDate";
import { targetsOnQuery } from "@/lib/queryOptions";
import { formatTarget } from "@/lib/targetFormat";
import type { TargetChange } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactElement } from "react";
import { NotAdviceNote } from "./NotAdviceNote";
import { TargetRangeFields, targetFieldId } from "./TargetRangeFields";
import {
  EMPTY_TARGET_FIELDS,
  firstInvalidField,
  parseTargetFields,
  type TargetField,
  type TargetFieldErrors,
} from "./targetForm";
import { removalOf, rewriteOf, type Removal, type Rewrite } from "./targetLines";

// ---------------------------------------------------------------------------
// TargetsSheet: a dated targets change. "Starts on" (today by default), the
// targets in force on that date as a line of text, the four fields, which
// always start empty, a line naming the days the save rewrites when it
// rewrites any, and the note on advice.
//
// The numbers in force appear in the in-force line only, never in a field:
// the app offers no number, not even the user's own as a starting point.
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

function rewriteText(t: T, rewrite: Rewrite): string {
  switch (rewrite.kind) {
    case "between":
      return t("rewriteBetween", { date: formatDay(rewrite.date), end: formatDay(rewrite.end) });
    case "day":
      return t("rewriteDay", { date: formatDay(rewrite.date) });
    case "from":
      return t("rewriteFrom", { date: formatDay(rewrite.date) });
    case "before":
      return t("rewriteBefore", { next: formatDay(rewrite.next) });
    case "all":
      return t("rewriteAll");
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
  const [values, setValues] = useState(EMPTY_TARGET_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<TargetFieldErrors>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify([date, values]), true);

  const validDate = isIsoDate(date);
  const { data: liveOnDate } = useQuery({ ...targetsOnQuery(date), enabled: validDate });
  // What the sheet shows, kept from the moment it starts to close: the
  // refetch after a save or a removal lands while it slides out, and would
  // otherwise switch its title and lines mid-exit.
  const live = useMemo(
    () => ({ today: liveToday, changes: liveChanges, onDate: liveOnDate }),
    [liveToday, liveChanges, liveOnDate],
  );
  const { today, changes, onDate } = useRetainedValue(open ? live : null) ?? live;
  const existing = validDate && changes.some((c) => c.effectiveFrom === date);
  const inForce = validDate ? (onDate?.inForce ?? null) : null;
  const inForceText = inForce
    ? t("inForce", {
        date: formatDay(onDate?.date ?? date),
        energyLower: formatTarget(inForce.ranges.energyKcal.lower),
        energyUpper: formatTarget(inForce.ranges.energyKcal.upper),
        proteinLower: formatTarget(inForce.ranges.proteinG.lower),
        proteinUpper: formatTarget(inForce.ranges.proteinG.upper),
      })
    : null;
  const rewrite = validDate ? rewriteOf(changes, date, today) : null;

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
          {/*
            The date, and under it, in the line its error would take, the targets
            in force on it: two lines of room whether or not it has loaded, so
            its arrival moves nothing. Set apart from the fields below.
          */}
          <div className="pb-3">
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
                    setDateError(null);
                  }}
                  required
                  autoFocus={autoFocus}
                  error={dateError}
                  hint={inForceText}
                  lineRoom="min-h-10"
                />
              </>
            ) : (
              <>
                <p className={labelClass}>{t("startsOn")}</p>
                <p className="text-base text-ink">{formatDay(editing)}</p>
                <p aria-live="polite" className="mt-1.5 min-h-10 text-sm text-ink">
                  {inForceText}
                </p>
              </>
            )}
          </div>
          <TargetRangeFields
            idPrefix={id}
            values={values}
            onChange={change}
            errors={fieldErrors}
            autoFocus={editing !== undefined && autoFocus}
          />
          {/*
            Always there, with room for its longest form at 320 wide, so picking
            a date never moves the sheet. Announced, so a screen reader hears
            which days a date rewrites.
          */}
          <p aria-live="polite" data-rewrite="" className="min-h-15 text-sm font-medium text-ink md:min-h-10">
            {rewrite && rewriteText(t, rewrite)}
          </p>
          <NotAdviceNote />
        </>
      )}
    </FormSheet>
  );
}
