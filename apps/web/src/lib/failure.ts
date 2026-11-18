import { getErrorCode, getErrorStatus } from "./errors";

// ---------------------------------------------------------------------------
// What a failed write says. Every write the app sends reads its failure the
// same way, so the forms, the log block and the log sheet's status line say
// one of three things:
//
// - Nothing was sent, because the app knows it is offline (`OfflineError`).
// - The write may have landed: no answer came, it timed out, or the server
//   faulted (`unconfirmed`). Sending it again with the same id is safe.
// - The server refused it: its code's own line from the catalog.
// ---------------------------------------------------------------------------

/** Thrown by a sheet's write that was not sent, because the device is known to be offline. */
export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

/** A failure the request may have survived: no answer, a timeout or a server fault. */
export function unconfirmed(err: unknown): boolean {
  const status = getErrorStatus(err);
  return getErrorCode(err) === "server_unreachable" || status === undefined || status >= 500;
}

/** A failure the connection explains: nothing was sent, or no answer came. */
export function connectionFailure(cause: unknown): boolean {
  return cause instanceof OfflineError || (cause !== null && cause !== undefined && unconfirmed(cause));
}

/** The two lines a place shows for a write that was not sent, or not confirmed. */
export interface FailureLines {
  offline: string;
  unconfirmed: string;
}

/** The line for a failed write: offline, not confirmed, or the refusal's own copy. */
export function failureLine(err: unknown, lines: FailureLines, forError: (err: unknown) => string): string {
  if (err instanceof OfflineError) return lines.offline;
  if (unconfirmed(err)) return lines.unconfirmed;
  return forError(err);
}
