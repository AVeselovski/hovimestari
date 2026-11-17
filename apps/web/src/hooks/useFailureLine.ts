import { failureLine } from "@/lib/failure";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useErrorCopy } from "./useErrorCopy";

/**
 * The line for a failed write (lib/failure.ts). A form, and the log block,
 * say it in full under their fields. The log sheet's status line has one
 * short line of room, so it says the short form.
 */
export function useFailureLine(place: "form" | "status"): (err: unknown) => string {
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("log.status");
  const { forError } = useErrorCopy();
  const offline = place === "form" ? tCommon("offline") : tStatus("offline");
  const notConfirmed = place === "form" ? tCommon("unconfirmed") : tStatus("unconfirmed");
  return useCallback(
    (err: unknown) => failureLine(err, { offline, unconfirmed: notConfirmed }, forError),
    [forError, notConfirmed, offline],
  );
}
