/**
 * Every error code the API answers with. The web app renders catalog copy by
 * code, and the backend's `message` is for API clients and logs.
 */
export const ERROR_CODES = [
  "invalid_email",
  "password_too_short",
  "password_too_long",
  "email_taken",
  "email_taken_google",
  "invalid_credentials",
  "session_expired",
  "google_unavailable",
  "google_failed",
  "google_email_taken",
  "google_taken",
  "reset_link_invalid",
  "password_already_set",
  "no_password",
  "last_sign_in_method",
  "invalid_method",
  "current_password_wrong",
  "confirmation_mismatch",
  "user_not_found",
  "login_rate_limited",
  "login_network_rate_limited",
  "signup_rate_limited",
  "reset_rate_limited",
  "password_rate_limited",
  "delete_rate_limited",
  "server_unreachable",
  "client_address_missing",
  "client_address_invalid",
  "google_already_linked",
  "request_refused",
  "invalid_request",
  "unauthorized",
  "google_email_unverified",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The body of every error response. */
export interface ApiError {
  message: string;
  code?: ErrorCode;
}

const CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/** Whether `value` is one of the API's error codes. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && CODES.has(value);
}
