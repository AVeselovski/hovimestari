import { errorTextClass, fieldErrorClass } from "@/components/ui/styles";
import type { ReactElement } from "react";

/**
 * The line for an error that belongs to no one field: under a page's form,
 * or in a form sheet's pinned footer above its buttons (`inFooter`), where it
 * is always in sight. Its two lines of room are kept while it is empty, so
 * nothing moves when an error appears. In the footer that room is given back
 * to the body while the on-screen keyboard is open (`footer-error-room` in
 * globals.css). Announced when it appears.
 */
export function FormError({ message, inFooter = false }: { message: string | null; inFooter?: boolean }): ReactElement {
  return (
    <p
      role="alert"
      data-form-error=""
      className={inFooter ? `footer-error-room ${errorTextClass}` : `${fieldErrorClass} min-h-10`}
    >
      {message}
    </p>
  );
}
