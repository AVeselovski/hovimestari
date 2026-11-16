"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

/**
 * Signs this device out, and reads "Signing out…" while it does. Settings
 * shows it as a button, the first-run page as a text button, so the caller
 * gives the look.
 */
export function SignOutButton({ className }: { className: string }): ReactElement {
  const t = useTranslations("settings.account");
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await signOut();
  }

  return (
    <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className={className}>
      <StableLabel active={signingOut} idle={t("signOut")} busy={t("signingOut")} />
    </button>
  );
}
