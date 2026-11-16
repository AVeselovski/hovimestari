"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { forgetSignedInPages } from "@/lib/forgetDevice";
import type { Me } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { DeleteAccountSheet } from "./DeleteAccountSheet";

/**
 * Delete account: the button, the sheet that confirms it, and what follows a
 * deletion. Settings shows it under Account, and the first-run page shows it
 * too, so a person without targets can still delete their account. The
 * caller gives the look.
 */
export function DeleteAccountButton({
  me,
  className,
}: {
  me: Pick<Me, "hasPassword">;
  className: string;
}): ReactElement {
  const t = useTranslations("settings.account");
  const { signOut } = useAuth();
  const sheet = useSheetTarget();

  // The query cache needs no clearing: it lives inside the signed-in tree,
  // which goes when the sign-out ends the session (lib/forgetDevice.ts).
  async function afterDeletion(): Promise<void> {
    await forgetSignedInPages();
    await signOut({ to: "/auth/sign-in?deleted=1" });
  }

  return (
    <>
      <button type="button" onClick={(e) => sheet.open(e.currentTarget)} className={className}>
        {t("deleteAccount")}
      </button>
      {sheet.shown && (
        <DeleteAccountSheet
          key={sheet.shown.key}
          open={sheet.isOpen}
          me={me}
          returnFocusTo={sheet.shown.opener}
          onClose={sheet.close}
          onSaved={() => void afterDeletion()}
        />
      )}
    </>
  );
}
