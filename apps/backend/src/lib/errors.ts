import type { ErrorCode, ErrorDetails } from "@hovimestari/types";

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
  /** When to try again, in seconds. The error middleware sends it as `Retry-After`. */
  public readonly retryAfterSeconds?: number;
  /** The index from 0 of the recipe line the refusal is about. The error middleware sends it as `line`. */
  public readonly line?: number;
  /** What the refusal is about, as its code defines. The error middleware sends it as `details`. */
  public readonly details?: ErrorDetails;

  constructor(
    public override readonly message: string,
    public readonly status: number = 400,
    /**
     * `code` is sent with the message. `cause` attaches the underlying error
     * when an AppError is translating something lower-level (a driver error,
     * a failed write). The error middleware never returns the cause to the
     * client: it is for logs and debuggers.
     */
    options: {
      code?: ErrorCode;
      cause?: unknown;
      retryAfterSeconds?: number;
      line?: number;
      details?: ErrorDetails;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.line = options.line;
    this.details = options.details;
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
  food_not_found: "This food is no longer available.",
  food_read_only: "Only your own foods can be changed.",
  food_name_required: "Give the food a name.",
  food_name_too_long: "Use at most 120 characters.",
  food_name_not_searchable: "Use at least two letters or digits in a row, so search can find the food.",
  food_value_required: "Enter a value from the label.",
  food_energy_invalid: "Enter a number from 0 to 1000.",
  food_macro_invalid: "Enter a number from 0 to 100.",
  food_macro_sum_too_high: "Protein, carbohydrates and fat add up to more than 100 g per 100 g.",
  barcode_invalid: "A barcode has 8 to 14 digits.",
  barcode_taken: "One of your foods already has this barcode.",
  barcode_wrong_digits: "No barcode has these digits. Check them against the pack.",
  barcode_lookup_limit: "You have looked up many barcodes this hour. Try again later.",
  barcode_lookup_busy: "Too many lookups at once. Try again in a few seconds.",
  barcode_lookup_unavailable: "Open Food Facts did not answer.",
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
  connection_name_required: "Give the connection a name.",
  connection_name_too_long: "Use at most 64 characters.",
  connection_name_invalid: "Use only characters that show on screen.",
  connection_expiry_invalid: "Choose 7, 30, 90 or 365 days.",
  connection_write_expiry_too_long: "A key that can make changes lasts at most 90 days.",
  connection_limit: "You already have 10 live connection keys. Revoke one first.",
  connection_not_found: "This connection does not exist or is already revoked.",
  connect_off: "Connecting an AI assistant is switched off on this server.",
  writes_off: "Keys that can make changes are switched off on this server.",
  request_key_reused: "This requestKey was already used for a different change. Use a new requestKey.",
  assistant_writes_per_minute:
    "Too many changes in a minute. Wait a minute, then send the same call again with the same requestKey. A change that already landed is not made twice.",
  assistant_changes_per_hour:
    "This account has had 300 changes by assistants in the last hour. Make the rest in the app, or wait.",
  recipe_not_found: "This recipe is no longer available.",
  recipe_id_taken: "This recipe id is already in use.",
  ingredient_id_taken: "This ingredient line id is already in use.",
  recipe_lines_required: "Add at least one ingredient.",
  recipe_lines_too_many: "A recipe has at most 60 ingredient lines.",
  recipe_servings_invalid: "Enter a whole number of servings from 1 to 100.",
  recipe_time_invalid: "Enter a whole number of minutes from 1 to 1440.",
  recipe_serving_too_large: "One serving comes to more than 10000 kcal or 1000 g of a macro.",
  food_edit_recipe_too_large:
    "A planned serving of a recipe on this food would come to more than 10000 kcal or 1000 g of a macro. Change the recipe or its planned entries first.",
  step_too_long: "Use at most 1000 characters in a step.",
  steps_too_many: "A recipe has at most 40 steps.",
  notes_too_long: "Use at most 2000 characters.",
  tag_invalid: "A tag has 1 to 30 characters.",
  tags_too_many: "A recipe has at most 10 tags.",
  line_name_required: "Give the ingredient a name.",
  line_name_too_long: "Use at most 80 characters.",
  line_note_too_long: "Use at most 80 characters.",
  written_amount_invalid: "Enter an amount above zero with at most two decimals, and a unit from the list.",
  cook_not_found: "This batch is no longer available.",
  cook_id_taken: "This batch id is already in use.",
  cook_entries_required: "Attach or add at least one serving from the batch.",
  cook_entry_invalid:
    "An entry to attach must be one of your plain entries of this recipe, and a status may only be set on an attached entry.",
};

/** An AppError for `code`, with the code's fixed message, and when to try again if that is known. */
export const appError = (code: ErrorCode, status: number, retryAfterSeconds?: number): AppError =>
  new AppError(ERROR_MESSAGES[code], status, { code, retryAfterSeconds });

/** An AppError for `code` about the recipe line at `line`, its index from 0. */
export const lineError = (code: ErrorCode, status: number, line: number): AppError =>
  new AppError(ERROR_MESSAGES[code], status, { code, line });
