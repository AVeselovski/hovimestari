import { isErrorCode, type ErrorCode } from "@hovimestari/types";
import axios from "axios";

// ---------------------------------------------------------------------------
// Errors from the API and from the auth route handlers. The web app shows
// catalog copy by the error's code (lib/errorCopy.ts), never the server's
// English `message`, which is for API clients and logs.
// ---------------------------------------------------------------------------

/**
 * A refused call to one of the app's own auth route handlers (`/api/auth/*`),
 * which answer with fetch rather than through the axios client.
 */
export class AuthRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | undefined;

  constructor(status: number, code: ErrorCode | undefined) {
    super(code ?? `request failed with ${status}`);
    this.name = "AuthRequestError";
    this.status = status;
    this.code = code;
  }

  /** The error for a handler's response, reading `code` from its JSON body when there is one. */
  static async from(res: Response): Promise<AuthRequestError> {
    let code: ErrorCode | undefined;
    try {
      const body = (await res.json()) as { code?: unknown };
      if (isErrorCode(body.code)) code = body.code;
    } catch {
      // No JSON body: the code stays unknown.
    }
    return new AuthRequestError(res.status, code);
  }
}

/**
 * The error code of a failed call: the code the server answered with, or
 * `server_unreachable` for a request that never got an answer. Undefined for
 * an answer without a known code, which shows the generic line.
 */
export function getErrorCode(err: unknown): ErrorCode | undefined {
  if (err instanceof AuthRequestError) return err.code;
  if (axios.isAxiosError(err)) {
    if (!err.response) return err.code === "ERR_CANCELED" ? undefined : "server_unreachable";
    const code = (err.response.data as { code?: unknown } | undefined)?.code;
    return isErrorCode(code) ? code : undefined;
  }
  // fetch rejects with a TypeError when the network fails.
  if (err instanceof TypeError) return "server_unreachable";
  return undefined;
}

/**
 * The values a refusal's catalog line reads: the strings and numbers in the
 * answer's `details`, such as the recipe a refused food edit names. Empty for
 * an answer without details.
 */
export function getErrorValues(err: unknown): Record<string, string | number> {
  if (!axios.isAxiosError(err)) return {};
  const details = (err.response?.data as { details?: unknown } | undefined)?.details;
  if (typeof details !== "object" || details === null) return {};
  return Object.fromEntries(
    Object.entries(details).filter((pair): pair is [string, string | number] =>
      ["string", "number"].includes(typeof pair[1]),
    ),
  );
}

/** The HTTP status of a failed call, or undefined for one that never got an answer. */
export function getErrorStatus(err: unknown): number | undefined {
  if (err instanceof AuthRequestError) return err.status;
  if (axios.isAxiosError(err)) return err.response?.status;
  return undefined;
}
