"use client";

import { Card } from "@/components/ui/Card";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnSecondary, btnSecondaryDanger, fieldErrorClass, focusRing } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { removeSignInMethod, startGoogleLink } from "@/lib/api/auth";
import { getErrorCode } from "@/lib/errors";
import { isGoogleLinkResult, type GoogleLinkResult } from "@/lib/googleLink";
import { afterAccountChange } from "@/lib/invalidation";
import { meQuery, providersQuery } from "@/lib/queryOptions";
import type { ErrorCode, Me } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { AddPasswordSheet } from "./AddPasswordSheet";
import { ChangePasswordSheet } from "./ChangePasswordSheet";

type Method = "password" | "google";

/** A line under the methods: what the last action came to. */
interface Notice {
  text: string;
  /** A failure reads in the accent, as every error line does. */
  failed: boolean;
}

const FAILED_RESULTS: ReadonlySet<GoogleLinkResult> = new Set(["taken", "failed"]);

/** The results that are an error code's: Settings says them with that code's line. */
const RESULT_CODES: Partial<Record<GoogleLinkResult, ErrorCode>> = {
  taken: "google_taken",
  already: "google_already_linked",
};

/** The sign-in methods of the signed-in account, once the account is known. */
export function SignInMethodsSection(): ReactElement | null {
  const { user, status } = useAuth();
  const { data: me } = useQuery({ ...meQuery(), enabled: status === "authenticated" });
  const account = me ?? user;
  return account ? <SignInMethods me={account} /> : null;
}

/**
 * The ways this account signs in: its password and Google. Each can be
 * added, and each can be removed while the other remains, so the account
 * always keeps a way in. Linking Google leaves the app for Google's consent
 * screen and comes back here with `?google=<result>`, which this section
 * reads once, says, and takes off the address.
 */
export function SignInMethods({ me }: { me: Me }): ReactElement {
  const t = useTranslations("settings.signInMethods");
  const errors = useErrorCopy();
  const queryClient = useQueryClient();
  const router = useRouter();
  const headingId = useId();
  const { data: providers } = useQuery(providersQuery());
  const googleOffered = providers?.google === true;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [linking, setLinking] = useState(false);
  const changeSheet = useSheetTarget();
  const addSheet = useSheetTarget();
  const passwordRowRef = useRef<HTMLDivElement>(null);
  const googleRowRef = useRef<HTMLDivElement>(null);

  // The result of a Google link, once, as the page opens after the round trip.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google");
    if (result === null) return;
    if (isGoogleLinkResult(result)) {
      const code = RESULT_CODES[result];
      const text = code
        ? errors.forCode(code)
        : result === "linked"
          ? t("googleResult.linked")
          : t("googleResult.failed");
      setNotice({ text, failed: FAILED_RESULTS.has(result) });
      if (result === "linked") void afterAccountChange(queryClient);
    }
    router.replace("/settings");
    // Mount only: the parameter is read once and then removed.
  }, []);

  const removal = useConfirmedDelete<Method, Me>({
    copy: (method) =>
      method === "password"
        ? {
            title: t("removePasswordTitle"),
            message: t("removePasswordBody"),
            confirmLabel: t("removePassword"),
            busyLabel: t("removingPassword"),
          }
        : {
            title: t("unlinkGoogleTitle"),
            message: t("unlinkGoogleBody"),
            confirmLabel: t("unlinkGoogle"),
            busyLabel: t("unlinkingGoogle"),
          },
    run: (method) => removeSignInMethod(method),
    // Refused because the other method is gone, removed on another device or
    // tab: the rows here are out of date, so the account is read again.
    onError: (err) => {
      if (getErrorCode(err) === "last_sign_in_method") void afterAccountChange(queryClient);
    },
    onDone: (next, method) => {
      void afterAccountChange(queryClient, next);
      setNotice({ text: method === "password" ? t("passwordRemoved") : t("googleUnlinked"), failed: false });
    },
    // The button that opened it goes with the method, so focus goes to the method's row, which stays.
    focusAfter: (_opener, method) => (method === "password" ? passwordRowRef.current : googleRowRef.current),
  });

  async function linkGoogle(): Promise<void> {
    setNotice(null);
    setLinking(true);
    try {
      const { url } = await startGoogleLink();
      // Stays busy while the browser leaves for Google.
      window.location.assign(url);
    } catch (err) {
      setNotice({ text: errors.forError(err), failed: true });
      setLinking(false);
    }
  }

  const both = me.hasPassword && me.hasGoogle;
  const showGoogle = googleOffered || me.hasGoogle;

  return (
    <Card labelledBy={headingId}>
      <Card.Header id={headingId} title={t("title")} />
      <div>
        <MethodRow
          rowRef={passwordRowRef}
          name={t("password")}
          state={me.hasPassword ? t("passwordSet") : t("passwordNotSet")}
        >
          {me.hasPassword ? (
            <button
              type="button"
              onClick={(e) => changeSheet.open(e.currentTarget)}
              className={`w-full md:w-auto ${btnSecondary}`}
            >
              {t("changePassword")}
            </button>
          ) : (
            <button
              type="button"
              // The button becomes Change password once saved, so focus goes back to the row.
              onClick={() => addSheet.open(passwordRowRef.current)}
              className={`w-full md:w-auto ${btnSecondary}`}
            >
              {t("addPassword")}
            </button>
          )}
          {both && (
            <button
              type="button"
              onClick={(e) => removal.open("password", e.currentTarget)}
              className={`w-full md:w-auto ${btnSecondaryDanger}`}
            >
              {t("removePassword")}
            </button>
          )}
        </MethodRow>
        {/* A plain rule: a row's own border would follow its rounded corners, which the focus ring needs. */}
        {showGoogle && <hr className="border-rule" />}
        {showGoogle && (
          <MethodRow
            rowRef={googleRowRef}
            name={t("google")}
            state={me.hasGoogle ? t("googleConnected") : t("googleNotConnected")}
          >
            {!me.hasGoogle && googleOffered && (
              <button
                type="button"
                onClick={() => void linkGoogle()}
                disabled={linking}
                className={`w-full md:w-auto ${btnSecondary}`}
              >
                <StableLabel active={linking} idle={t("linkGoogle")} busy={t("linkingGoogle")} />
              </button>
            )}
            {both && (
              <button
                type="button"
                onClick={(e) => removal.open("google", e.currentTarget)}
                className={`w-full md:w-auto ${btnSecondaryDanger}`}
              >
                {t("unlinkGoogle")}
              </button>
            )}
          </MethodRow>
        )}
      </div>
      <p role="status" className={notice?.failed ? `mt-4 ${fieldErrorClass}` : "mt-4 text-base text-ink empty:hidden"}>
        {notice?.text}
      </p>

      {changeSheet.shown && (
        <ChangePasswordSheet
          key={changeSheet.shown.key}
          open={changeSheet.isOpen}
          email={me.email}
          returnFocusTo={changeSheet.shown.opener}
          onClose={changeSheet.close}
          onSaved={() => {
            void afterAccountChange(queryClient);
            setNotice({ text: t("passwordChanged"), failed: false });
          }}
        />
      )}
      {addSheet.shown && (
        <AddPasswordSheet
          key={addSheet.shown.key}
          open={addSheet.isOpen}
          email={me.email}
          returnFocusTo={addSheet.shown.opener}
          onClose={addSheet.close}
          onSaved={(next) => {
            void afterAccountChange(queryClient, next);
            setNotice({ text: t("passwordAdded"), failed: false });
          }}
        />
      )}
      {removal.dialog}
    </Card>
  );
}

/** One sign-in method: its name, whether it is set up, and what can be done with it. */
function MethodRow({
  rowRef,
  name,
  state,
  children,
}: {
  rowRef: RefObject<HTMLDivElement | null>;
  name: string;
  state: string;
  children: ReactNode;
}): ReactElement {
  const nameId = useId();
  return (
    <div
      ref={rowRef}
      tabIndex={-1}
      role="group"
      aria-labelledby={nameId}
      className={`rounded-control py-4 first:pt-0 last:pb-0 ${focusRing}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={nameId} className="text-lg font-semibold text-ink">
          {name}
        </h3>
        <span className="text-base text-ink-muted">{state}</span>
      </div>
      <div className="mt-3 grid gap-2 md:flex md:flex-wrap md:gap-3">{children}</div>
    </div>
  );
}
