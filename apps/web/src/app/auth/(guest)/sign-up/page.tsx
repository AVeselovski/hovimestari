"use client";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, focusRing, inputClass, labelClass } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { isSafeRedirectPath } from "@/lib/redirect";
import type { UserMe } from "@finanssiappis/types";
import { RegisterBodySchema } from "@finanssiappis/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
}

function SignUpContent() {
  const t = useTranslations("auth.signUp");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const googleAuthUrl = process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL;
  const { login } = useAuth();

  const redirectParam = searchParams.get("redirect");

  useEffect(() => {
    if (isSafeRedirectPath(redirectParam)) {
      sessionStorage.setItem("postLoginRedirect", redirectParam!);
    }
  }, [redirectParam]);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const result = RegisterBodySchema.safeParse({ displayName, email, password });
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
      const res = await api.post<RegisterResponse>("/auth/register", result.data);
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
      router.replace("/");
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, t("registrationFailedError")));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card border border-line-subtle bg-surface-1 p-8 shadow-modal">
        <h1 className="mb-2 text-center text-lg font-semibold tracking-tight text-content">{tCommon("appName")}</h1>
        <p className="mb-6 text-center text-sm text-content-secondary">{t("subtitle")}</p>

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
            <label htmlFor="displayName" className={labelClass}>
              {t("displayNameLabel")}
            </label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
            {fieldErrors.displayName && <p className="mt-1 text-xs text-negative">{fieldErrors.displayName}</p>}
          </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-content-muted">{t("minimumPasswordHint")}</p>
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

        <p className="mt-6 text-center text-sm text-content-muted">
          {t("alreadyHaveAccountPrompt")}{" "}
          <Link
            href="/auth/sign-in"
            className={`rounded-control text-content-secondary transition-colors duration-150 hover:text-content hover:underline ${focusRing}`}
          >
            {t("signInLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}
