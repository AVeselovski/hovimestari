"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { useArmedAtRest } from "@/hooks/useArmedAtRest";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useIsMobile } from "@/hooks/useIsMobile";
import { deleteAccount } from "@/lib/api/users";
import { getErrorCode } from "@/lib/errors";
import type { DeleteAccountBody, Me } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";

/**
 * Delete the account. An account with a password confirms with it, and one
 * that signs in only with Google types its email address, as the server
 * requires. The Delete button takes a press only once the confirmation is
 * filled and, on a phone, once the sheet is at rest: a double tap on the
 * opener must never reach it. What happens after the deletion (sign-out,
 * clearing this device) is the caller's `onSaved`.
 */
export function DeleteAccountSheet({
  open,
  me,
  returnFocusTo,
  onClose,
  onSaved,
}: FormSheetCallerProps & { me: Pick<Me, "hasPassword"> }): ReactElement {
  const t = useTranslations("settings.deleteAccount");
  const errors = useErrorCopy();
  const arming = useArmedAtRest(open, useIsMobile());
  const fieldId = `${useId()}-confirm`;
  const withPassword = me.hasPassword;

  const [confirmation, setConfirmation] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(confirmation, true);
  const filled = confirmation.trim() !== "";

  async function handleSubmit(): Promise<void> {
    // Enter in the field submits too, so the button's own guards are checked again.
    if (!filled || !arming.armed) return;
    setFieldError(undefined);
    setFormError(null);
    setSubmitting(true);
    const body: DeleteAccountBody = withPassword ? { password: confirmation } : { email: confirmation };
    try {
      await deleteAccount(body);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "confirmation_mismatch") {
        // Says which of the two did not match, and what to do.
        setFieldError(withPassword ? t("passwordMismatch") : t("emailMismatch"));
        focusField(fieldId);
      } else if (code === "invalid_email") {
        setFieldError(errors.forCode(code));
        focusField(fieldId);
      } else {
        setFormError({ line: errors.forError(err), cause: err });
      }
      setSubmitting(false);
      return;
    }
    // Still busy: the sheet slides out showing "Deleting…" while the caller signs out.
    onSaved?.();
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("body")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      onSubmit={handleSubmit}
      formError={formError}
      onOpened={arming.onOpened}
      idle={t("submit")}
      busy={t("submitting")}
      tone="danger"
      submitDisabled={!filled}
      submitGuard={arming.guardProps}
    >
      {({ autoFocus }) =>
        withPassword ? (
          <Field
            id={fieldId}
            name="current-password"
            label={t("password")}
            type="password"
            autoComplete="current-password"
            autoFocus={autoFocus}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={fieldError}
          />
        ) : (
          <Field
            id={fieldId}
            name="confirm-email"
            label={t("email")}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={fieldError}
          />
        )
      }
    </FormSheet>
  );
}
