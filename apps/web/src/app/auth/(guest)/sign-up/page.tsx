"use client";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { POST_LOGIN_REDIRECT_KEY } from "@/components/GuestGuard";
import { AuthPage } from "@/components/auth/AuthPage";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, standaloneLinkClass } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAvailable } from "@/contexts/ProvidersContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { getErrorCode } from "@/lib/errors";
import { safeRedirectHere } from "@/lib/redirect";
import { RegisterBodySchema } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactElement } from "react";
import { Field } from "../_components/Field";
import { FormError } from "../_components/FormError";
import { fieldOfCode, focusField } from "../_components/focus";
import { firstIssues } from "../_components/issues";

function SignUpForm(): ReactElement {
  const t = useTranslations("auth.signUp");
  const tSignIn = useTranslations("auth.signIn");
  const tFields = useTranslations("auth.fields");
  const errors = useErrorCopy();
  const { signUp } = useAuth();
  const google = useGoogleAvailable();
  const redirect = useSearchParams().get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const parsed = RegisterBodySchema.safeParse({ email, password });
    if (!parsed.success) {
      const issues = firstIssues(parsed.error);
      setFieldErrors({
        email: issues.email && errors.forCode(issues.email),
        password: issues.password && errors.forCode(issues.password),
      });
      focusField(issues.email ? "email" : "password");
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signUp(parsed.data);
    } catch (err) {
      setFormError(errors.forError(err));
      setSubmitting(false);
      focusField(fieldOfCode(getErrorCode(err), { email: "email", password: "password" }));
    }
  }

  const safeRedirect = safeRedirectHere(redirect);
  const signInHref = safeRedirect ? `/auth/sign-in?redirect=${encodeURIComponent(safeRedirect)}` : "/auth/sign-in";

  return (
    <AuthPage title={t("title")}>
      {google && (
        <>
          <GoogleSignInButton onNavigate={rememberRedirect} />
          <div className="my-6 flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-rule" />
            {tSignIn("or")}
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
          name="new-password"
          label={tFields("password")}
          hint={t("passwordHint")}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <FormError message={formError} />
        <button type="submit" disabled={submitting} className={`w-full ${btnPrimary}`}>
          <StableLabel active={submitting} idle={t("submit")} busy={t("submitting")} />
        </button>
      </form>

      <div className="mt-8">
        <Link href={signInHref} className={standaloneLinkClass}>
          {t("signInLink")}
        </Link>
      </div>
    </AuthPage>
  );
}

export default function SignUpPage(): ReactElement {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
