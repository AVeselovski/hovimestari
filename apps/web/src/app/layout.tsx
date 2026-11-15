import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NO_FLASH_SCRIPT } from "@/lib/theme/noFlashScript";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanssiappis",
  description: "Personal finance management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the no-flash script below mutates
    // `data-theme`/`data-theme-mode` on this element before React hydrates,
    // so its attributes legitimately differ between server and client
    // render — see docs/design/ui-overhaul.md §d.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs synchronously in <head>, before hydration and before first
            paint, so <html> already carries the right data-theme on the
            very first painted frame. Deliberately not a module and not
            deferred — see lib/theme/noFlashScript.ts. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Outermost provider — painting is irrelevant to auth/locale, so
            ThemeProvider wraps both (docs/design/ui-overhaul.md §d). */}
        <ThemeProvider>
          {/* docs/design/i18n-message-catalog.md, D2 — no props needed: reads
              the locale/messages resolved by src/i18n/request.ts. Outside
              AuthProvider so the catalog is available regardless of auth
              state. */}
          <NextIntlClientProvider>
            <AuthProvider>{children}</AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
