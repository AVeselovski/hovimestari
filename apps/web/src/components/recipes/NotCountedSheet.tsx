"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { FormSheet, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { sectionStart } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { MAX_LINE_NAME_LENGTH, MAX_LINE_NOTE_LENGTH, type ErrorCode } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import type { PlainDraft } from "./recipeDraft";
import {
  WrittenFields,
  readWritten,
  writtenFieldsOf,
  type WrittenFieldValues,
  type WrittenRefusal,
} from "./WrittenFields";

// ---------------------------------------------------------------------------
// NotCountedSheet: a line not counted, such as salt or water, stacked on the
// recipe editor. Its name, the recipe's own words for its amount and a
// note. It adds no figures, and the sheet says so above its fields. Add puts
// a new line at the end of the ingredients. A line opened from the editor
// has Save, and Remove at the start of the footer. Nothing is sent until the
// recipe is saved.
// ---------------------------------------------------------------------------

export type NotCountedSheetProps = FormSheetCallerProps & {
  /** The line to change, or null for a new one. */
  line: PlainDraft | null;
  onAdd: (line: Omit<PlainDraft, "id">) => void;
  onSave: (line: PlainDraft) => void;
  onRemove: (id: string) => void;
  /** The label of the action in Remove ingredient's place where it takes the line out and deletes nothing: drawn in ink. */
  takeOutLabel?: string;
};

interface Fields {
  name: string;
  written: WrittenFieldValues;
  note: string;
}

export function NotCountedSheet({
  open,
  onClose,
  returnFocusTo,
  line,
  onAdd,
  onSave,
  onRemove,
  takeOutLabel,
}: NotCountedSheetProps): ReactElement {
  const t = useTranslations("recipes.notCounted");
  const tPicker = useTranslations("recipes.picker");
  const errorCopy = useErrorCopy();
  const id = useId();
  const [initial] = useState<Fields>(() => ({
    name: line?.name ?? "",
    written: writtenFieldsOf(line?.written ?? null),
    note: line?.note ?? "",
  }));
  const [fields, setFields] = useState<Fields>(initial);
  const [errors, setErrors] = useState<{ name?: ErrorCode; written?: WrittenRefusal; note?: ErrorCode }>({});
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);

  function submit(): void {
    const name = fields.name.trim();
    const note = fields.note.trim();
    const written = readWritten(fields.written);
    const next = {
      name:
        name === ""
          ? ("line_name_required" as const)
          : name.length > MAX_LINE_NAME_LENGTH
            ? ("line_name_too_long" as const)
            : undefined,
      written: written.ok ? undefined : written.refusal,
      note: note.length > MAX_LINE_NOTE_LENGTH ? ("line_note_too_long" as const) : undefined,
    };
    if (next.name || !written.ok || next.note) {
      setErrors(next);
      if (next.name) focusField(`${id}-name`);
      else if (next.written) focusField(`${id}-written-${next.written}`);
      return;
    }
    const value = { kind: "plain" as const, name, written: written.value, note: note === "" ? null : note };
    if (line) onSave({ ...value, id: line.id });
    else onAdd(value);
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={line ? t("titleEdit") : t("titleNew")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={false}
      onSubmit={submit}
      formError={null}
      idle={line ? t("save") : t("add")}
      busy={line ? t("save") : t("add")}
      footerStart={
        line
          ? {
              label: takeOutLabel ?? t("remove"),
              tone: takeOutLabel ? "neutral" : undefined,
              onPress: () => {
                onRemove(line.id);
                onClose();
              },
            }
          : undefined
      }
      sheet={{ panelClassName: "md:max-w-md" }}
    >
      {({ autoFocus }) => (
        <>
          <Field
            id={`${id}-name`}
            name="name"
            label={t("name")}
            autoComplete="off"
            enterKeyHint="next"
            autoFocus={autoFocus}
            value={fields.name}
            onChange={(e) => {
              setFields((f) => ({ ...f, name: e.target.value }));
              setErrors((er) => ({ ...er, name: undefined }));
            }}
            error={errors.name ? errorCopy.forCode(errors.name) : null}
          />
          <WrittenFields
            idPrefix={id}
            values={fields.written}
            refusal={errors.written ?? null}
            onChange={(written) => {
              setFields((f) => ({ ...f, written }));
              setErrors((er) => ({ ...er, written: undefined }));
            }}
          />
          {/* 16px under As written's line, which always holds its hint, as in the ingredient picker. */}
          <div className={sectionStart}>
            <Field
              id={`${id}-note`}
              name="note"
              label={tPicker("note")}
              hint={tPicker("noteHint")}
              autoComplete="off"
              value={fields.note}
              onChange={(e) => setFields((f) => ({ ...f, note: e.target.value }))}
              error={errors.note ? errorCopy.forCode(errors.note) : null}
            />
          </div>
        </>
      )}
    </FormSheet>
  );
}
