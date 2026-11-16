"use client";

import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnSecondary, btnSecondaryDanger } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { getErrorCode } from "@/lib/errors";
import { forgetSignedInPages } from "@/lib/forgetDevice";
import { meQuery } from "@/lib/queryOptions";
import { lastKnownEmail } from "@/lib/sessionMarker";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { DeleteAccountSheet } from "./DeleteAccountSheet";

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
  const [signingOut, setSigningOut] = useState(false);

  const everywhere = useSheetTarget();
  const [everywhereBusy, setEverywhereBusy] = useState(false);
  const [everywhereError, setEverywhereError] = useState<string | null>(null);
  const deleteSheet = useSheetTarget();

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await signOut();
  }

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

  // The query cache needs no clearing: it lives inside the signed-in tree,
  // which goes when the sign-out ends the session (lib/forgetDevice.ts).
  async function afterDeletion(): Promise<void> {
    await forgetSignedInPages();
    await signOut({ to: "/auth/sign-in?deleted=1" });
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
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className={`w-full md:w-auto ${btnSecondary}`}
        >
          <StableLabel active={signingOut} idle={t("signOut")} busy={t("signingOut")} />
        </button>
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
          <button
            type="button"
            onClick={(e) => deleteSheet.open(e.currentTarget)}
            className={`w-full md:w-auto ${btnSecondaryDanger}`}
          >
            {t("deleteAccount")}
          </button>
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
      {deleteSheet.shown && account && (
        <DeleteAccountSheet
          key={deleteSheet.shown.key}
          open={deleteSheet.isOpen}
          me={account}
          returnFocusTo={deleteSheet.shown.opener}
          onClose={deleteSheet.close}
          onSaved={() => void afterDeletion()}
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
