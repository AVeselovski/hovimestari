"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { firstIssues, passwordFieldError } from "@/components/form/issues";
import { FormSheet, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { addPassword } from "@/lib/api/auth";
import { getErrorCode } from "@/lib/errors";
import { LinkPasswordBodySchema, type Me } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";

/**
 * Add a password to an account that signs in with Google. Adding one leaves
 * every session as it is, so the copy says nothing about other devices.
 */
export function AddPasswordSheet({
  open,
  email,
  returnFocusTo,
  onClose,
  onSaved,
}: Omit<FormSheetCallerProps, "onSaved"> & { email: string; onSaved: (me: Me) => void }): ReactElement {
  const t = useTranslations("settings.addPassword");
  const errors = useErrorCopy();
  const passwordId = `${useId()}-password`;

  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(password, true);

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const parsed = LinkPasswordBodySchema.safeParse({ password });
    if (!parsed.success) {
      setFieldError(errors.forCode(firstIssues(parsed.error).password));
      focusField(passwordId);
      return;
    }
    setFieldError(undefined);
    setSubmitting(true);
    let me: Me;
    try {
      me = await addPassword(parsed.data);
    } catch (err) {
      const onField = passwordFieldError(getErrorCode(err));
      if (onField) {
        setFieldError(errors.forCode(onField));
        focusField(passwordId);
      } else {
        setFormError(errors.forError(err));
      }
      setSubmitting(false);
      return;
    }
    onSaved(me);
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("intro")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      onSubmit={handleSubmit}
      formError={formError}
      username={email}
      idle={t("save")}
      busy={t("saving")}
    >
      {({ autoFocus }) => (
        <Field
          id={passwordId}
          name="new-password"
          label={t("newPassword")}
          hint={t("passwordHint")}
          type="password"
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
        />
      )}
    </FormSheet>
  );
}
