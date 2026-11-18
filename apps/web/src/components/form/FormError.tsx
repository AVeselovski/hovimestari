import { errorTextClass, fieldErrorClass } from "@/components/ui/styles";
import type { ReactElement } from "react";

/**
 * The line for an error that belongs to no one field: under a page's form,
 * or in a form sheet's pinned footer above its buttons (`inFooter`), where it
 * is always in sight. Under a page's form its two lines of room are kept
 * while it is empty, so the button under it never moves. In the footer on a
 * phone it keeps no room: the sheet holds its height, so an error appears
 * above the buttons, the footer grows upward and the buttons stay where they
 * were. From `md` the dialog is anchored at its top and would grow downward,
 * moving the buttons, so there the footer keeps two lines of room for it.
 * Announced when it appears.
 */
export function FormError({ message, inFooter = false }: { message: string | null; inFooter?: boolean }): ReactElement {
  return (
    <p
      role="alert"
      data-form-error=""
      className={inFooter ? `${errorTextClass} mb-2 max-md:empty:mb-0 md:min-h-10` : `${fieldErrorClass} min-h-10`}
    >
      {message}
    </p>
  );
}
