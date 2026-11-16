"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { firstIssues, passwordFieldError } from "@/components/form/issues";
import { FormSheet, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFormDirty } from "@/hooks/useFormDirty";
import { changePassword } from "@/lib/api/users";
import { getErrorCode } from "@/lib/errors";
import { ChangePasswordBodySchema } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";

/**
 * Change password: the current one and a new one. The server ends every
 * session when the password changes, this device's included, so the sheet
 * then signs this device straight back in with the new password and the
 * person stays where they are. When that sign-in fails, this device signs
 * out and lands on the sign-in page with its note.
 */
export function ChangePasswordSheet({
  open,
  email,
  returnFocusTo,
  onClose,
  onSaved,
}: FormSheetCallerProps & { email: string }): ReactElement {
  const t = useTranslations("settings.changePassword");
  const errors = useErrorCopy();
  const { signIn, signOut } = useAuth();
  const id = useId();
  const currentId = `${id}-current`;
  const nextId = `${id}-next`;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify([current, next]), true);

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const parsed = ChangePasswordBodySchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) {
      const issues = firstIssues(parsed.error);
      const found = {
        current: issues.currentPassword ? t("currentRequired") : undefined,
        next: issues.newPassword ? errors.forCode(issues.newPassword) : undefined,
      };
      setFieldErrors(found);
      focusField(found.current ? currentId : nextId);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await changePassword(parsed.data);
    } catch (err) {
      const code = getErrorCode(err);
      const onNew = passwordFieldError(code);
      if (code === "current_password_wrong") {
        setFieldErrors({ current: errors.forCode(code) });
        focusField(currentId);
      } else if (onNew) {
        setFieldErrors({ next: errors.forCode(onNew) });
        focusField(nextId);
      } else {
        setFormError(errors.forError(err));
      }
      setSubmitting(false);
      return;
    }
    // Every session has ended. This device continues under the new password.
    try {
      await signIn({ email, password: parsed.data.newPassword });
    } catch {
      await signOut({ to: "/auth/sign-in?reset=1" });
      return;
    }
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    onClose();
  }

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
      username={email}
      idle={t("save")}
      busy={t("saving")}
    >
      {({ autoFocus }) => (
        <>
          <Field
            id={currentId}
            name="current-password"
            label={t("currentPassword")}
            type="password"
            autoComplete="current-password"
            autoFocus={autoFocus}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={fieldErrors.current}
          />
          <Field
            id={nextId}
            name="new-password"
            label={t("newPassword")}
            hint={t("passwordHint")}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={fieldErrors.next}
          />
        </>
      )}
    </FormSheet>
  );
}
