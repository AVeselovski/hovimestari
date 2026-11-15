"use client";

import { ErrorFrame } from "@/components/ErrorFrame";
import { NO_FLASH_SCRIPT } from "@/lib/theme/noFlashScript";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../messages/en.json";
import "./globals.css";

/**
 * The root layout itself failed, so this replaces it: its own document, the
 * theme script and the catalog, and nothing that could fail the same way.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider locale="en" messages={messages}>
          <ErrorFrame onRetry={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
