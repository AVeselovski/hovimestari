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
  "food_not_found",
  "food_read_only",
  "food_name_required",
  "food_name_too_long",
  "food_name_not_searchable",
  "food_value_required",
  "food_energy_invalid",
  "food_macro_invalid",
  "food_macro_sum_too_high",
  "barcode_invalid",
  "barcode_taken",
  "barcode_wrong_digits",
  "barcode_lookup_limit",
  "barcode_lookup_busy",
  "barcode_lookup_unavailable",
  "portion_not_found",
  "portion_read_only",
  "portion_name_required",
  "portion_name_too_long",
  "portion_grams_invalid",
  "portions_too_many",
  "invalid_time_zone",
  "entry_not_found",
  "entry_id_taken",
  "entry_kind_mismatch",
  "entry_eaten_in_future",
  "entry_grams_invalid",
  "entry_count_invalid",
  "figure_required",
  "figure_invalid",
  "name_required",
  "name_too_long",
  "note_too_long",
  "saved_meal_not_found",
  "saved_meal_id_taken",
  "meal_source_too_long",
  "connection_name_required",
  "connection_name_too_long",
  "connection_name_invalid",
  "connection_expiry_invalid",
  "connection_write_expiry_too_long",
  "connection_limit",
  "connection_not_found",
  "connect_off",
  "writes_off",
  "request_key_reused",
  "assistant_writes_per_minute",
  "assistant_changes_per_hour",
  "recipe_not_found",
  "recipe_id_taken",
  "ingredient_id_taken",
  "recipe_lines_required",
  "recipe_lines_too_many",
  "recipe_servings_invalid",
  "recipe_time_invalid",
  "recipe_serving_too_large",
  "food_edit_recipe_too_large",
  "step_too_long",
  "steps_too_many",
  "notes_too_long",
  "tag_invalid",
  "tags_too_many",
  "line_name_required",
  "line_name_too_long",
  "line_note_too_long",
  "written_amount_invalid",
  "cook_not_found",
  "cook_id_taken",
  "cook_entries_required",
  "cook_entry_invalid",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The body of every error response. */
export interface ApiError {
  message: string;
  code?: ErrorCode;
  /** The index from 0 of the recipe line a refusal is about, when it is about one. */
  line?: number;
  /**
   * What the refusal is about, when its code says. Each string or number in
   * it is a value of the code's catalog line. `food_edit_recipe_too_large`
   * carries `recipe` (the first recipe by name), `others` (how many more) and
   * `recipes` (the first three names).
   */
  details?: ErrorDetails;
}

/** The details of a refusal: values its catalog line reads, and lists for API clients. */
export type ErrorDetails = Record<string, string | number | string[]>;

const CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/** Whether `value` is one of the API's error codes. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && CODES.has(value);
}
