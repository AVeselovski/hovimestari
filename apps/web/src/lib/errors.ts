import axios from "axios";

export function getErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string })?.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * The HTTP status of a failed API call, or `undefined` for a non-axios error
 * (e.g. a thrown validation error before the request went out). Lets a
 * caller branch on a specific status — e.g. the debt-payments 422 ("no
 * linked interest bucket") rendering an actionable "Edit account" action
 * instead of a plain error string (issue #144, slice 1b).
 */
export function getErrorStatus(err: unknown): number | undefined {
  if (axios.isAxiosError(err)) {
    return err.response?.status;
  }
  return undefined;
}
