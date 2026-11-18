import { footerRefusal, refusalLine } from "@/components/ui/styles";
import { revealPageRefusal } from "@/lib/revealRefused";
import { useLayoutEffect, useRef, type ReactElement } from "react";

/**
 * The line for an error that belongs to no field, right above the buttons:
 * in a page's form, or in a form sheet's pinned footer (`inFooter`), where it
 * is always in sight. On a phone it keeps no room. In a sheet the footer
 * grows upward and the buttons stay where they were, since the sheet holds
 * its height. On a page the button moves down by the refusal's height, and
 * the refusal stays next to it. From `md` it keeps two lines of room, so the
 * buttons never move under the pointer (`refusalLine`). Announced when it
 * appears. On a page it also scrolls itself and the button into view, above
 * a phone's keyboard (`revealPageRefusal`).
 */
export function FormError({ message, inFooter = false }: { message: string | null; inFooter?: boolean }): ReactElement {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (message !== null && !inFooter) revealPageRefusal(ref.current);
  }, [message, inFooter]);
  return (
    <p ref={ref} role="alert" data-form-error="" className={inFooter ? footerRefusal : refusalLine}>
      {message}
    </p>
  );
}
