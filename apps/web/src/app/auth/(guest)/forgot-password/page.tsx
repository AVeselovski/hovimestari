"use client";

import { AuthPage } from "@/components/auth/AuthPage";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, noticeClass, standaloneLinkClass } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { requestPasswordReset } from "@/lib/api/auth";
import { getErrorStatus } from "@/lib/errors";
import { ForgotPasswordBodySchema } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";
import { Field } from "../_components/Field";
import { FormError } from "../_components/FormError";
import { focusField } from "../_components/focus";
import { firstIssues } from "../_components/issues";

export default function ForgotPasswordPage(): ReactElement {
  const t = useTranslations("auth.forgotPassword");
  const tFields = useTranslations("auth.fields");
  const errors = useErrorCopy();

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setFormError(null);
    const parsed = ForgotPasswordBodySchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(errors.forCode(firstIssues(parsed.error).email));
      focusField("email");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
    } catch (err) {
      // A limited request gets the usual answer, so the page tells nothing about the address.
      if (getErrorStatus(err) === 429) setSent(true);
      else {
        setFormError(errors.forError(err));
        focusField("email");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage title={t("title")}>
      {sent ? (
        <p role="status" className={noticeClass}>
          {t("sent")}
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-3">
          <Field
            id="email"
            name="email"
            label={tFields("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
          />
          <FormError message={formError} />
          <button type="submit" disabled={submitting} className={`w-full ${btnPrimary}`}>
            <StableLabel active={submitting} idle={t("submit")} busy={t("submitting")} />
          </button>
        </form>
      )}
      <div className="mt-8">
        <Link href="/auth/sign-in" className={standaloneLinkClass}>
          {t("backToSignIn")}
        </Link>
      </div>
    </AuthPage>
  );
}
