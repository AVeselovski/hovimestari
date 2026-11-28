import type { ReactNode } from "react";

/**
 * The `<digits>` tag of a catalog line, which sets a barcode in mono as one
 * span, wherever a line names one. `normal-case tracking-normal` keep the
 * digits plain inside an upper-case heading and do nothing elsewhere.
 */
export function monoDigits(chunks: ReactNode): ReactNode {
  return <span className="font-mono normal-case tracking-normal">{chunks}</span>;
}
