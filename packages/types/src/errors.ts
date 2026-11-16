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
  "invalid_date",
  "target_required",
  "target_value_invalid",
  "target_not_positive",
  "target_lower_above_upper",
  "target_change_not_found",
  "targets_last_change",
  "food_not_found",
  "food_read_only",
  "food_name_required",
  "food_name_too_long",
  "food_name_not_searchable",
  "food_value_required",
  "food_energy_invalid",
  "food_macro_invalid",
  "barcode_invalid",
  "barcode_taken",
  "portion_not_found",
  "portion_read_only",
  "portion_name_required",
  "portion_name_too_long",
  "portion_grams_invalid",
  "invalid_time_zone",
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
