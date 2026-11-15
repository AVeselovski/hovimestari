"use client";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { POST_LOGIN_REDIRECT_KEY } from "@/components/GuestGuard";
import { AuthPage } from "@/components/auth/AuthPage";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, errorNoticeClass, noticeClass, standaloneLinkClass } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAvailable } from "@/contexts/ProvidersContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { getErrorCode } from "@/lib/errors";
import { safeRedirectHere } from "@/lib/redirect";
import { LoginBodySchema, isErrorCode } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactElement } from "react";
import { Field } from "../_components/Field";
import { FormError } from "../_components/FormError";
import { fieldOfCode, focusField } from "../_components/focus";
import { firstIssues } from "../_components/issues";

function SignInForm(): ReactElement {
  const t = useTranslations("auth.signIn");
  const tFields = useTranslations("auth.fields");
  const errors = useErrorCopy();
  const { signIn } = useAuth();
  const google = useGoogleAvailable();
  const params = useSearchParams();

  const redirect = params.get("redirect");
  const urlError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Google's round trip loses the query string, so the destination waits in this tab's storage.
  function rememberRedirect(): void {
    try {
      const target = safeRedirectHere(redirect);
      if (target) sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, target);
    } catch {
      // Storage refused: the user lands on the Day tab.
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setFormError(null);
    const parsed = LoginBodySchema.safeParse({ email, password });
    if (!parsed.success) {
      const issues = firstIssues(parsed.error);
      setFieldErrors({
        email: issues.email && errors.forCode(issues.email),
        password:
          issues.password &&
          (isErrorCode(issues.password) ? errors.forCode(issues.password) : tFields("passwordRequired")),
      });
      focusField(issues.email ? "email" : "password");
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signIn(parsed.data);
    } catch (err) {
      setFormError(errors.forError(err));
      setSubmitting(false);
      focusField(fieldOfCode(getErrorCode(err), { email: "email", password: "password" }));
    }
  }

  const safeRedirect = safeRedirectHere(redirect);
  const signUpHref = safeRedirect ? `/auth/sign-up?redirect=${encodeURIComponent(safeRedirect)}` : "/auth/sign-up";

  return (
    <AuthPage title={t("title")}>
      {params.get("reset") === "1" && <p className={`${noticeClass} mb-6`}>{t("resetNote")}</p>}
      {params.get("deleted") === "1" && <p className={`${noticeClass} mb-6`}>{t("deletedNote")}</p>}
      {urlError && (
        <p role="alert" className={`${errorNoticeClass} mb-6`}>
          {errors.forCode(urlError)}
        </p>
      )}

      {google && (
        <>
          <GoogleSignInButton onNavigate={rememberRedirect} />
          <div className="my-6 flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-rule" />
            {t("or")}
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-3">
        <Field
          id="email"
          name="email"
          label={tFields("email")}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Field
          id="password"
          name="password"
          label={tFields("password")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <FormError message={formError} />
        <button type="submit" disabled={submitting} className={`w-full ${btnPrimary}`}>
          <StableLabel active={submitting} idle={t("submit")} busy={t("submitting")} />
        </button>
      </form>

      <div className="mt-8 flex flex-col items-start gap-1 text-base">
        <Link href="/auth/forgot-password" className={standaloneLinkClass}>
          {t("forgotPassword")}
        </Link>
        <Link href={signUpHref} className={standaloneLinkClass}>
          {t("createAccount")}
        </Link>
      </div>
    </AuthPage>
  );
}

export default function SignInPage(): ReactElement {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
