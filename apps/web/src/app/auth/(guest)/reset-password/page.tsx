"use client";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, focusRing, inputClass, labelClass } from "@/components/ui/styles";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { ResetPasswordBodySchema } from "@finanssiappis/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";

function ResetPasswordContent() {
  const t = useTranslations("auth.resetPassword");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ newPassword?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md space-y-4 rounded-card border border-line-subtle bg-surface-1 p-8 text-center shadow-modal">
          <p className="text-negative">{t("invalidLinkMessage")}</p>
          <Link
            href="/auth/forgot-password"
            className="text-sm text-content-secondary transition-colors duration-150 hover:text-content hover:underline"
          >
            {t("requestNewLink")}
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirm: t("passwordsMismatchError") });
      return;
    }

    const result = ResetPasswordBodySchema.safeParse({ token, newPassword });
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
      await api.post("/auth/reset-password", result.data);
      router.replace("/auth/sign-in?reset=success");
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, t("resetFailedError")));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-card border border-line-subtle bg-surface-1 p-8 shadow-modal">
        <h1 className="mb-2 text-center text-lg font-semibold tracking-tight text-content">{tCommon("appName")}</h1>
        <p className="mb-6 text-center text-sm text-content-secondary">{t("subtitle")}</p>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          noValidate
          className="space-y-4"
        >
          <div>
            <label htmlFor="newPassword" className={labelClass}>
              {t("newPasswordLabel")}
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-content-muted">{t("minimumPasswordHint")}</p>
            {fieldErrors.newPassword && <p className="mt-1 text-xs text-negative">{fieldErrors.newPassword}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className={labelClass}>
              {t("confirmPasswordLabel")}
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
            {fieldErrors.confirm && <p className="mt-1 text-xs text-negative">{fieldErrors.confirm}</p>}
          </div>

          {formError && (
            <p className="rounded-control border border-negative-line bg-negative-soft px-3 py-2 text-sm text-negative">
              {formError}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className={`w-full ${btnPrimary}`}>
            <StableLabel active={isSubmitting} idle={t("submitAction")} busy={tCommon("saving")} />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-content-muted">
          <button
            type="button"
            onClick={() => router.push("/auth/sign-in")}
            className={`rounded-control text-content-secondary transition-colors duration-150 hover:text-content hover:underline ${focusRing}`}
          >
            {t("backToSignIn")}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
