"use client";

import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { SignOutButton } from "@/components/account/SignOutButton";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { btnSecondary, btnSecondaryDanger } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { getErrorCode } from "@/lib/errors";
import { meQuery } from "@/lib/queryOptions";
import { lastKnownEmail } from "@/lib/sessionMarker";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";

const noSubscription = (): (() => void) => () => {};

/**
 * Who is signed in, and leaving: signing out of this device, of every
 * device, and deleting the account.
 *
 * While the server cannot be reached and no session was confirmed on this
 * launch, it names the address this device was last signed in to, worded so
 * it does not claim the session was just checked.
 */
export function AccountSection(): ReactElement {
  const t = useTranslations("settings.account");
  const errors = useErrorCopy();
  const { user, status, signOut } = useAuth();
  // The session already carries the user. The read keeps it current after account changes.
  const { data: me } = useQuery({ ...meQuery(), enabled: status === "authenticated" });
  const account = me ?? user;
  // Read from storage after hydration: the server render knows no device.
  const remembered = useSyncExternalStore(noSubscription, lastKnownEmail, () => null);

  const everywhere = useSheetTarget();
  const [everywhereBusy, setEverywhereBusy] = useState(false);
  const [everywhereError, setEverywhereError] = useState<string | null>(null);

  async function handleSignOutEverywhere(): Promise<void> {
    setEverywhereError(null);
    setEverywhereBusy(true);
    try {
      await signOut({ everywhere: true });
    } catch (err) {
      // Nothing changed: this device stays signed in, and says so.
      setEverywhereError(
        getErrorCode(err) === "server_unreachable" ? t("signOutEverywhereFailed") : errors.forError(err),
      );
      setEverywhereBusy(false);
    }
  }

  return (
    <Card labelledBy="settings-account">
      <Card.Header id="settings-account" title={t("title")} />
      {account ? (
        <EmailLine text={t.rich("signedInAs", { email: account.email, strong: strongEmail(account.email) })} />
      ) : (
        remembered && (
          <EmailLine text={t.rich("lastSignedInAs", { email: remembered, strong: strongEmail(remembered) })} />
        )
      )}
      <div className="grid gap-2 md:flex md:flex-wrap md:gap-3">
        <SignOutButton className={`w-full md:w-auto ${btnSecondary}`} />
        {account && (
          <button
            type="button"
            onClick={(e) => {
              setEverywhereError(null);
              everywhere.open(e.currentTarget);
            }}
            className={`w-full md:w-auto ${btnSecondary}`}
          >
            {t("signOutEverywhere")}
          </button>
        )}
      </div>
      {account && (
        <div className="mt-6 border-t border-rule pt-6">
          <DeleteAccountButton me={account} className={`w-full md:w-auto ${btnSecondaryDanger}`} />
        </div>
      )}

      {everywhere.shown && (
        <ConfirmDialog
          key={everywhere.shown.key}
          open={everywhere.isOpen}
          title={t("signOutEverywhereTitle")}
          message={t("signOutEverywhereBody")}
          confirmLabel={t("signOutEverywhereConfirm")}
          busyLabel={t("signingOut")}
          tone="primary"
          isLoading={everywhereBusy}
          error={everywhereError}
          returnFocusTo={everywhere.shown.opener}
          onConfirm={() => void handleSignOutEverywhere()}
          onCancel={everywhere.close}
        />
      )}
    </Card>
  );
}

function EmailLine({ text }: { text: ReactNode }): ReactElement {
  return <p className="mb-5 text-base text-ink [overflow-wrap:anywhere]">{text}</p>;
}

function strongEmail(email: string): () => ReactElement {
  function Strong(): ReactElement {
    return <strong className="font-semibold">{breakableEmail(email)}</strong>;
  }
  return Strong;
}

/**
 * An email with line-break chances before "@" and each ".", so a long
 * address wraps at its parts on a narrow phone instead of mid-word. A part
 * longer than the line still wraps anywhere rather than overflow.
 */
export function breakableEmail(email: string): ReactNode[] {
  return email.split(/(?=[@.])/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}
