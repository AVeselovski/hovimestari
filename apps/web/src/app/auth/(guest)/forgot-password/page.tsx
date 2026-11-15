"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, focusRing, inputClass, labelClass } from "@/components/ui/styles";
import { api } from "@/lib/api";
import { ForgotPasswordBodySchema } from "@finanssiappis/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import React, { useState } from "react";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);

    const result = ForgotPasswordBodySchema.safeParse({ email });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? t("invalidEmailFallback"));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/forgot-password", result.data);
    } catch {
      // Intentionally swallow errors to prevent email enumeration
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card border border-line-subtle bg-surface-1 p-8 shadow-modal">
        <h1 className="mb-2 text-center text-lg font-semibold tracking-tight text-content">{tCommon("appName")}</h1>
        <p className="mb-6 text-center text-sm text-content-secondary">{t("subtitle")}</p>

        {submitted ? (
          <div className="space-y-4">
            <p className="rounded-control border border-positive-line bg-positive-soft px-4 py-3 text-sm text-positive">
              {t("successMessage")}
            </p>
            <p className="text-center text-sm text-content-muted">
              <Link
                href="/auth/sign-in"
                className={`rounded-control text-content-secondary transition-colors duration-150 hover:text-content hover:underline ${focusRing}`}
              >
                {t("backToSignIn")}
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
              noValidate
              className="space-y-4"
            >
              <div>
                <label htmlFor="email" className={labelClass}>
                  {t("emailAddressLabel")}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
                {fieldError && <p className="mt-1 text-xs text-negative">{fieldError}</p>}
              </div>

              <button type="submit" disabled={isSubmitting} className={`w-full ${btnPrimary}`}>
                <StableLabel active={isSubmitting} idle={t("submitAction")} busy={t("submittingAction")} />
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-content-muted">
              <Link
                href="/auth/sign-in"
                className={`rounded-control text-content-secondary transition-colors duration-150 hover:text-content hover:underline ${focusRing}`}
              >
                {t("backToSignIn")}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
