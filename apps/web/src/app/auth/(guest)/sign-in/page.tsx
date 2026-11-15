"use client";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, focusRing, inputClass, labelClass } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { isSafeRedirectPath } from "@/lib/redirect";
import type { UserMe } from "@finanssiappis/types";
import { LoginBodySchema } from "@finanssiappis/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

function SignInContent() {
  const t = useTranslations("auth.signIn");
  const tCommon = useTranslations("common");
  const googleAuthUrl = process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL;
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const resetSuccess = searchParams.get("reset") === "success";
  const googleEmailTaken = searchParams.get("error") === "google_email_taken";
  // The Google callback sends a sign-in that did not finish back here.
  const googleSignInFailed = searchParams.get("error") === "oauth_failed";
  const redirectParam = searchParams.get("redirect");

  // Persist the redirect destination so the Google OAuth callback page can
  // pick it up after the full-page navigation to Google and back.
  useEffect(() => {
    if (isSafeRedirectPath(redirectParam)) {
      sessionStorage.setItem("postLoginRedirect", redirectParam!);
    }
  }, [redirectParam]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const result = LoginBodySchema.safeParse({ email, password });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", result.data);
      const { accessToken, refreshToken } = res.data;

      await fetch("/api/auth/set-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ refreshToken }),
      });

      const meRes = await api.get<UserMe>("/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      login(accessToken, meRes.data);
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, t("signInFailedError")));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card border border-line-subtle bg-surface-1 p-8 shadow-modal">
        <h1 className="mb-2 text-center text-lg font-semibold tracking-tight text-content">{tCommon("appName")}</h1>
        <p className="mb-6 text-center text-sm text-content-secondary">{t("subtitle")}</p>

        {resetSuccess && (
          <p className="mb-4 rounded-control border border-positive-line bg-positive-soft px-3 py-2 text-center text-sm text-positive">
            {t("resetSuccessBanner")}
          </p>
        )}

        {googleEmailTaken && (
          <p className="mb-4 rounded-control border border-negative-line bg-negative-soft px-3 py-2 text-center text-sm text-negative">
            {t("googleEmailTakenBanner")}
          </p>
        )}

        {googleSignInFailed && (
          <p
            role="alert"
            className="mb-4 rounded-control border border-negative-line bg-negative-soft px-3 py-2 text-center text-sm text-negative"
          >
            {t("googleSignInFailedBanner")}
          </p>
        )}

        <GoogleSignInButton href={googleAuthUrl} />

        {googleAuthUrl && (
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-xs text-content-muted">
              <span className="bg-surface-1 px-2">{t("orContinueWithEmail")}</span>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          noValidate
          className="space-y-4"
        >
          <div>
            <label htmlFor="email" className={labelClass}>
              {t("emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-negative">{fieldErrors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              {t("passwordLabel")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {fieldErrors.password && <p className="mt-1 text-xs text-negative">{fieldErrors.password}</p>}
          </div>

          {formError && (
            <p className="rounded-control border border-negative-line bg-negative-soft px-3 py-2 text-sm text-negative">
              {formError}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className={`w-full ${btnPrimary}`}>
            <StableLabel active={isSubmitting} idle={t("submitAction")} busy={t("submittingAction")} />
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-content-muted">
          <p>
            <Link
              href="/auth/forgot-password"
              className={`rounded-control text-content-secondary transition-colors duration-150 hover:text-content hover:underline ${focusRing}`}
            >
              {t("forgotPasswordLink")}
            </Link>
          </p>
          <p>
            {t("noAccountPrompt")}{" "}
            <Link
              href={redirectParam ? `/auth/sign-up?redirect=${encodeURIComponent(redirectParam)}` : "/auth/sign-up"}
              className={`rounded-control text-content-secondary transition-colors duration-150 hover:text-content hover:underline ${focusRing}`}
            >
              {t("signUpLink")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
