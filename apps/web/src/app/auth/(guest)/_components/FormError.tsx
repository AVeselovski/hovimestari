import { fieldErrorClass } from "@/components/ui/styles";
import type { ReactElement } from "react";

/**
 * The line under a form for an error that belongs to no one field. Its two
 * lines of room are kept while it is empty, so the button under it never
 * moves when an error appears. Announced when it appears.
 */
export function FormError({ message }: { message: string | null }): ReactElement {
  return (
    <p role="alert" className={`${fieldErrorClass} min-h-10`}>
      {message}
    </p>
  );
}
