"use client";

import { AuthPage } from "@/components/auth/AuthPage";
import { btnPrimary } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * Offline on a device with no known session: the guest side, never the app.
 * The offline line comes from AuthPage.
 */
export function OfflineSignedOut(): ReactElement {
  const t = useTranslations("session");
  return (
    <AuthPage title={t("offlineTitle")}>
      <p className="text-base text-ink">{t("offlineBody")}</p>
    </AuthPage>
  );
}

/** The server answered with a fault of its own. The session is kept, and the person retries. */
export function SessionProblem(): ReactElement {
  const t = useTranslations("session");
  const { retry } = useAuth();
  return (
    <AuthPage title={t("problemTitle")}>
      <p role="alert" className="mb-6 text-base text-ink">
        {t("problemBody")}
      </p>
      <button type="button" onClick={retry} className={`w-full ${btnPrimary}`}>
        {t("retry")}
      </button>
    </AuthPage>
  );
}
