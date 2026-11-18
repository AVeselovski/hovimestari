import type { ErrorCode } from "@hovimestari/types";

/**
 * AppError represents a known, intentional error whose message is safe to
 * send to the client. Throw this for validation errors, auth failures, 404s,
 * etc. — anything where the message is written by us, not derived from an
 * external system (DB, filesystem, third-party API).
 *
 * All other errors are treated as unexpected and return a generic 500 message.
 */
export class AppError extends Error {
  /** The stable code the web app renders its copy by. */
  public readonly code?: ErrorCode;

  constructor(
    public override readonly message: string,
    public readonly status: number = 400,
    /**
     * `code` is sent with the message. `cause` attaches the underlying error
     * when an AppError is translating something lower-level (a driver error,
     * a failed write). The error middleware never returns the cause to the
     * client: it is for logs and debuggers.
     */
    options: { code?: ErrorCode; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
  }
}

/** The backend's fixed English text for each code, for API clients and logs. The web app shows its own copy. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_email: "Enter a valid email address.",
  password_too_short: "The password must be at least 8 characters.",
  password_too_long: "The password must be at most 72 bytes.",
  email_taken: "An account with this email already exists.",
  email_taken_google: "An account with this email already exists. Sign in with Google to access it.",
  invalid_credentials: "Invalid email or password.",
  session_expired: "Your session has ended. Sign in again.",
  google_unavailable: "Google sign-in is not available.",
  google_failed: "Signing in with Google failed.",
  google_email_taken: "An account with this email already exists. Sign in with your password.",
  google_taken: "That Google account is already linked to another account.",
  reset_link_invalid: "This password reset link is invalid or has expired.",
  password_already_set: "This account already has a password.",
  no_password: "This account has no password to change.",
  last_sign_in_method: "You cannot remove your only way to sign in.",
  invalid_method: "The method must be google or password.",
  current_password_wrong: "The current password is incorrect.",
  confirmation_mismatch: "That does not match this account.",
  user_not_found: "This account no longer exists.",
  login_rate_limited: "Too many sign-in attempts. Try again in 15 minutes.",
  login_network_rate_limited: "Too many sign-in attempts from this network. Try again in 15 minutes.",
  signup_rate_limited: "Too many sign-ups from this network. Try again later.",
  reset_rate_limited: "Too many password reset requests. Try again later.",
  password_rate_limited: "Too many attempts. Try again in 15 minutes.",
  delete_rate_limited: "Too many attempts. Try again in 15 minutes.",
  server_unreachable: "The server cannot be reached.",
  client_address_missing: "A relayed request must name the client address.",
  client_address_invalid: "The relayed client address is not an IP address.",
  google_already_linked: "Google is already connected to this account.",
  request_refused: "The request was refused.",
  invalid_request: "The request is not valid.",
  unauthorized: "Sign in to do this.",
  google_email_unverified: "Google has not verified the email address of that Google account.",
  invalid_date: "Enter a valid date.",
  target_required: "Enter a number.",
  target_value_invalid: "Enter a number with at most one decimal, below 100000 for calories or 10000 for protein.",
  target_not_positive: "Enter a number above zero.",
  target_lower_above_upper: "The second number cannot be below the first.",
  target_change_not_found: "These targets no longer exist.",
  targets_last_change: "You need at least one set of targets.",
  food_not_found: "This food is no longer available.",
  food_read_only: "Only your own foods can be changed.",
  food_name_required: "Give the food a name.",
  food_name_too_long: "Use at most 120 characters.",
  food_name_not_searchable: "Use at least two letters or digits in a row, so search can find the food.",
  food_value_required: "Enter a value from the label.",
  food_energy_invalid: "Enter a number from 0 to 1000.",
  food_macro_invalid: "Enter a number from 0 to 100.",
  food_macro_sum_too_high: "Protein, carbohydrates and fat add up to more than 100 g in 100 g.",
  barcode_invalid: "A barcode has 8 to 14 digits.",
  barcode_taken: "One of your foods already has this barcode.",
  portion_not_found: "This portion is no longer available.",
  portion_read_only: "Only your own portions can be changed.",
  portion_name_required: "Give the portion a name.",
  portion_name_too_long: "Use at most 60 characters.",
  portion_grams_invalid: "Enter a weight above zero, up to 5000 g.",
  invalid_time_zone: "That is not a time zone this server knows.",
  entry_not_found: "This entry is no longer there.",
  entry_id_taken: "This entry id is already in use.",
  entry_kind_mismatch: "This change does not fit this kind of entry.",
  entry_eaten_in_future: "An entry on a future date can only be planned.",
  entry_grams_invalid: "Enter a weight above zero, up to 5000 g, with at most one decimal.",
  entry_count_invalid: "Enter a number above zero, up to 100, with at most two decimals.",
  figure_required: "Enter a value.",
  figure_invalid: "Enter a number with at most one decimal, up to 10000 kcal or 1000 g.",
  name_required: "Give it a name.",
  name_too_long: "Use at most 120 characters.",
  note_too_long: "Use at most 500 characters.",
  saved_meal_not_found: "This saved meal is no longer available.",
  saved_meal_id_taken: "This saved meal id is already in use.",
  meal_source_too_long: "Use at most 40 characters.",
};

/** An AppError for `code`, with the code's fixed message. */
export const appError = (code: ErrorCode, status: number): AppError =>
  new AppError(ERROR_MESSAGES[code], status, { code });
