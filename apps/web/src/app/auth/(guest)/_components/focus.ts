import type { ErrorCode } from "@hovimestari/types";

/** Moves focus to the field with this id, if it is on the page. */
export function focusField(id: string | undefined): void {
  if (id) document.getElementById(id)?.focus();
}

/**
 * The field a server refusal is about, so focus can go back to it. A refusal
 * about no one field, such as wrong credentials or a rate limit, goes back to
 * the first field.
 */
export function fieldOfCode(
  code: ErrorCode | undefined,
  fields: { email?: string; password?: string },
): string | undefined {
  switch (code) {
    case "invalid_email":
    case "email_taken":
    case "email_taken_google":
      return fields.email;
    case "password_too_short":
    case "password_too_long":
      return fields.password;
    default:
      return fields.email ?? fields.password;
  }
}
