import { errorCopyKey } from "@/lib/errorCopy";
import { getErrorCode } from "@/lib/errors";
import { isErrorCode, type ErrorCode } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

export interface ErrorCopy {
  /** The catalog line for a failed call, by its error code. */
  forError: (err: unknown) => string;
  /** The catalog line for a code, such as one a client-side schema check or a URL gave. Unknown codes get the generic line. */
  forCode: (code: string | undefined) => string;
}

/** Turns an error code into the catalog's copy for it. Never shows the server's own message. */
export function useErrorCopy(): ErrorCopy {
  const t = useTranslations("errors");
  const forCode = useCallback(
    (code: string | undefined) => t(errorCopyKey(isErrorCode(code) ? (code as ErrorCode) : undefined)),
    [t],
  );
  const forError = useCallback((err: unknown) => t(errorCopyKey(getErrorCode(err))), [t]);
  return { forError, forCode };
}
