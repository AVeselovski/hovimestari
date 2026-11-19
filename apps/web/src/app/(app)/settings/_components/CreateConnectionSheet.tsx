"use client";

import { useConnectionReveal } from "@/components/ConnectionRevealProvider";
import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { firstIssues } from "@/components/form/issues";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { SelectField } from "@/components/ui/SelectField";
import { fieldHintClass, labelClass, linelessBlock, lineRoom, noticeClass, sectionStart } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { createConnection } from "@/lib/api/connections";
import { getErrorCode } from "@/lib/errors";
import { afterConnectionCreateFailed } from "@/lib/invalidation";
import {
  CONNECTION_EXPIRY_DAYS,
  CONNECTION_WRITE_EXPIRY_DAYS,
  CreateConnectionBodySchema,
  DEFAULT_CONNECTION_EXPIRY_DAYS,
  MAX_CONNECTION_NAME_LENGTH,
  type ConnectionAccess,
  type CreatedConnection,
  type ErrorCode,
} from "@hovimestari/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import { AccessLevelField, ReadOnlyAccessLine } from "./AccessLevelField";

type ExpiryDays = (typeof CONNECTION_EXPIRY_DAYS)[number];

/** The longest a key that can make changes may last: what a chosen year becomes. */
const LONGEST_WRITE_EXPIRY = CONNECTION_WRITE_EXPIRY_DAYS[CONNECTION_WRITE_EXPIRY_DAYS.length - 1];

/** Refusals about the name: they show under the Name field. */
const NAME_CODES: ReadonlySet<ErrorCode> = new Set([
  "connection_name_required",
  "connection_name_too_long",
  "connection_name_invalid",
]);

const CONSENT_READ = ["reads", "vendor", "barcodes", "secret", "answers"] as const;
const CONSENT_WRITE = ["reads", "changes", "asks", "recorded", "vendor", "barcodes", "secret", "answers"] as const;

interface CreateConnectionSheetProps extends FormSheetCallerProps {
  /**
   * The server makes keys that can make changes. While it does not, the form
   * offers no Access choice: one plain line says the key reads only.
   */
  writeAvailable: boolean;
}

/**
 * "Connect an assistant": a name, the access, a lifetime and the consent.
 *
 * Access drives two things. A key that can make changes lasts at most 90
 * days, so 1 year is not offered for it and a chosen year becomes 90 days.
 * And the tick holds for the access it was given at: the box shows ticked
 * only while that access is chosen.
 *
 * On success the key goes straight into the reveal store and this sheet
 * closes, in one update, so the key reveal opens as this sheet leaves. The
 * mutation keeps nothing: it is collected at once (`gcTime: 0`) and reset in
 * the same handler. The list is left as it is while the reveal is up, so
 * nothing moves behind it. Its new row comes when the reveal closes.
 *
 * After any failure the list is read again too. A refusal that says the
 * server switched something off changes what the form offers, and a create
 * whose answer never arrived may still have made a key, which then shows as
 * a row the person can revoke.
 */
export function CreateConnectionSheet({
  open,
  returnFocusTo,
  onClose,
  writeAvailable,
}: CreateConnectionSheetProps): ReactElement {
  const t = useTranslations("settings.connectedAi.create");
  const errors = useErrorCopy();
  const queryClient = useQueryClient();
  const { show } = useConnectionReveal();
  const id = useId();
  const nameId = `${id}-name`;
  const expiryId = `${id}-expiry`;
  const expiryLineId = `${id}-expiry-line`;
  const consentId = `${id}-consent`;

  const [name, setName] = useState("");
  const [chosenAccess, setChosenAccess] = useState<ConnectionAccess>("read");
  const [chosenExpiry, setChosenExpiry] = useState<ExpiryDays>(DEFAULT_CONNECTION_EXPIRY_DAYS);
  // The access the box was ticked for. The consent holds only for that one.
  const [agreedTo, setAgreedTo] = useState<ConnectionAccess | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify([name, chosenAccess, chosenExpiry, agreedTo]), true);

  const create = useMutation({ mutationFn: createConnection, gcTime: 0 });

  // Writing switched off while the sheet is open makes it a read key.
  const access: ConnectionAccess = writeAvailable ? chosenAccess : "read";
  const agreed = agreedTo === access;
  const expiryOptions: readonly ExpiryDays[] =
    access === "read_write" ? CONNECTION_WRITE_EXPIRY_DAYS : CONNECTION_EXPIRY_DAYS;
  const expiry: ExpiryDays = expiryOptions.includes(chosenExpiry) ? chosenExpiry : LONGEST_WRITE_EXPIRY;
  const canCreate = name.trim() !== "" && agreed;

  function chooseAccess(next: ConnectionAccess): void {
    setChosenAccess(next);
    setFormError(null);
    if (next === "read_write" && !(CONNECTION_WRITE_EXPIRY_DAYS as readonly number[]).includes(chosenExpiry)) {
      setChosenExpiry(LONGEST_WRITE_EXPIRY);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canCreate) return;
    setFormError(null);
    const parsed = CreateConnectionBodySchema.safeParse({ name, access, expiresInDays: expiry });
    if (!parsed.success) {
      const issues = firstIssues(parsed.error);
      if (issues.name) {
        setNameError(errors.forCode(issues.name));
        focusField(nameId);
      } else {
        setFormError({ line: errors.forCode(Object.values(issues)[0]), cause: null });
      }
      return;
    }
    setNameError(null);
    setSubmitting(true);
    let created: CreatedConnection;
    try {
      created = await create.mutateAsync(parsed.data);
    } catch (err: unknown) {
      create.reset();
      const code = getErrorCode(err);
      if (code !== undefined && NAME_CODES.has(code)) {
        setNameError(errors.forCode(code));
        focusField(nameId);
      } else {
        setFormError({ line: code === undefined ? t("failed") : errors.forCode(code), cause: err });
      }
      void afterConnectionCreateFailed(queryClient);
      setSubmitting(false);
      return;
    }
    // One update: the key into the store (the reveal opens), the mutation
    // emptied, and this sheet closed. Still busy while it slides out.
    show({ connection: created.connection, key: created.key });
    create.reset();
    onClose();
  }

  const write = access === "read_write";
  const consent = write
    ? CONSENT_WRITE.map((line) => ({ line, text: t(`consentWrite.${line}`) }))
    : CONSENT_READ.map((line) => ({ line, text: t(`consentRead.${line}`) }));

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={t("title")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("submit")}
      busy={t("submitting")}
      submitDisabled={!canCreate}
      sheet={{ panelClassName: "md:max-w-lg" }}
    >
      {({ autoFocus }) => (
        <>
          <Field
            id={nameId}
            name="connection-name"
            label={t("name")}
            hint={t("nameHint")}
            type="text"
            autoComplete="off"
            autoFocus={autoFocus}
            maxLength={MAX_CONNECTION_NAME_LENGTH}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              setFormError(null);
            }}
            error={nameError}
          />

          <div className={linelessBlock}>
            {writeAvailable ? <AccessLevelField value={access} onChange={chooseAccess} /> : <ReadOnlyAccessLine />}
          </div>

          <div>
            <label htmlFor={expiryId} className={labelClass}>
              {t("expiry")}
            </label>
            <SelectField
              id={expiryId}
              value={expiry}
              onChange={(e) => setChosenExpiry(Number(e.target.value) as ExpiryDays)}
              aria-describedby={access === "read_write" ? expiryLineId : undefined}
            >
              {expiryOptions.map((days) => (
                <option key={days} value={days}>
                  {t(`days${days}`)}
                </option>
              ))}
            </SelectField>
            {/* The line's room is kept only while the access can change, so the hint moves nothing when it comes. */}
            {writeAvailable && (
              <p id={expiryLineId} className={`${fieldHintClass} ${lineRoom}`}>
                {access === "read_write" ? t("writeExpiryHint") : null}
              </p>
            )}
          </div>

          <section aria-labelledby={`${id}-consent-title`} className={`${sectionStart} ${noticeClass}`}>
            <h3 id={`${id}-consent-title`} className="text-base font-semibold text-ink">
              {t("consentTitle")}
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base">
              {consent.map(({ line, text }) => (
                <li key={line}>{text}</li>
              ))}
            </ul>
            <Checkbox
              id={consentId}
              checked={agreed}
              onChange={(next) => setAgreedTo(next ? access : null)}
              className="mt-3 flex min-h-11 items-start gap-3 py-2.5 text-base font-semibold text-ink"
            >
              <span>{write ? t("consentWrite.agree") : t("consentRead.agree")}</span>
            </Checkbox>
          </section>
        </>
      )}
    </FormSheet>
  );
}
