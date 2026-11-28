"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// ExternalLink: a link to another site over https, opened in a new tab. It never hands
// the new page a handle back to this one (`noopener noreferrer`), and it
// tells a screen reader that it opens a new tab, with a phrase only a screen
// reader hears. Every link that leaves the app goes through it. A link whose
// words on screen do not say where it goes takes a `label` that does, which
// starts with those words, and the new-tab phrase follows it.
// ---------------------------------------------------------------------------

export function ExternalLink({
  href,
  className,
  label,
  children,
}: {
  /** Only an https address: the type refuses any other scheme. */
  href: `https://${string}`;
  className?: string;
  /** The name a screen reader says, when the words on screen are shorter. It starts with them. */
  label?: string;
  children: ReactNode;
}): ReactElement {
  const t = useTranslations("common");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label === undefined ? undefined : `${label} ${t("opensInNewTab")}`}
      className={className}
    >
      {children}
      {label === undefined && <span className="sr-only"> {t("opensInNewTab")}</span>}
    </a>
  );
}
