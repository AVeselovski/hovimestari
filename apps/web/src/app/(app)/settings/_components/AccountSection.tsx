"use client";

import { Card } from "@/components/ui/Card";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnSecondary } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { meQuery } from "@/lib/queryOptions";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type ReactElement, type ReactNode } from "react";

/** Who is signed in, and signing out of this device. */
export function AccountSection(): ReactElement {
  const t = useTranslations("settings.account");
  const { user, status, signOut } = useAuth();
  // The session already carries the user. The read keeps it current after account changes.
  const { data: me } = useQuery({ ...meQuery(), enabled: status === "authenticated" });
  const email = me?.email ?? user?.email;
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await signOut();
  }

  return (
    <Card labelledBy="settings-account">
      <Card.Header id="settings-account" title={t("title")} />
      {email && (
        <p className="mb-5 text-base text-ink [overflow-wrap:anywhere]">
          {t.rich("signedInAs", {
            email,
            strong: () => <strong className="font-semibold">{breakableEmail(email)}</strong>,
          })}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        className={`w-full md:w-auto ${btnSecondary}`}
      >
        <StableLabel active={signingOut} idle={t("signOut")} busy={t("signingOut")} />
      </button>
    </Card>
  );
}

/**
 * An email with line-break chances before "@" and each ".", so a long
 * address wraps at its parts on a narrow phone instead of mid-word. A part
 * longer than the line still wraps anywhere rather than overflow.
 */
export function breakableEmail(email: string): ReactNode[] {
  return email.split(/(?=[@.])/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}
