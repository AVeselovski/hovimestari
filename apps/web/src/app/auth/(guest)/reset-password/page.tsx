"use client";

import { AuthPage } from "@/components/auth/AuthPage";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, errorNoticeClass, standaloneLinkClass } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { resetPassword } from "@/lib/api/auth";
import { ResetPasswordBodySchema } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactElement } from "react";
import { Field } from "../_components/Field";
import { FormError } from "../_components/FormError";
import { focusField } from "../_components/focus";
import { firstIssues } from "../_components/issues";

function ResetPasswordForm(): ReactElement {
  const t = useTranslations("auth.resetPassword");
  const errors = useErrorCopy();
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; repeat?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setFormError(null);
    const parsed = ResetPasswordBodySchema.safeParse({ token, newPassword: password });
    const passwordIssue = parsed.success ? undefined : firstIssues(parsed.error).newPassword;
    const next = {
      password: passwordIssue && errors.forCode(passwordIssue),
      repeat: repeat !== password ? t("mismatch") : undefined,
    };
    setFieldErrors(next);
    if (!parsed.success || next.repeat) {
      focusField(next.password ? "new-password" : "repeat-password");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(parsed.data);
      router.replace("/auth/sign-in?reset=1");
    } catch (err) {
      setFormError(errors.forError(err));
      setSubmitting(false);
      focusField("new-password");
    }
  }

  if (!token) {
    return (
      <AuthPage title={t("title")}>
        <p role="alert" className={errorNoticeClass}>
          {errors.forCode("reset_link_invalid")}
        </p>
        <div className="mt-8">
          <Link href="/auth/forgot-password" className={standaloneLinkClass}>
            {t("newLink")}
          </Link>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={t("title")}>
      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-3">
        <Field
          id="new-password"
          name="new-password"
          label={t("newPassword")}
          hint={t("passwordHint")}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Field
          id="repeat-password"
          name="repeat-password"
          label={t("repeatPassword")}
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={fieldErrors.repeat}
        />
        <FormError message={formError} />
        <button type="submit" disabled={submitting} className={`w-full ${btnPrimary}`}>
          <StableLabel active={submitting} idle={t("submit")} busy={t("submitting")} />
        </button>
      </form>
      <div className="mt-8">
        <Link href="/auth/forgot-password" className={standaloneLinkClass}>
          {t("newLink")}
        </Link>
      </div>
    </AuthPage>
  );
}

export default function ResetPasswordPage(): ReactElement {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
