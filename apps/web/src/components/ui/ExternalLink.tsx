"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// ExternalLink: a link to another site over https, opened in a new tab. It never hands
// the new page a handle back to this one (`noopener noreferrer`), and it
// tells a screen reader that it opens a new tab, with a phrase only a screen
// reader hears. Every link that leaves the app goes through it.
// ---------------------------------------------------------------------------

export function ExternalLink({
  href,
  className,
  children,
}: {
  /** Only an https address: the type refuses any other scheme. */
  href: `https://${string}`;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const t = useTranslations("common");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> {t("opensInNewTab")}</span>
    </a>
  );
}
