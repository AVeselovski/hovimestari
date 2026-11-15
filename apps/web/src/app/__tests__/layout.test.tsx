import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { THEME_STORAGE_KEY } from "@/lib/theme/noFlashScript";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import RootLayout from "../layout";

// ---------------------------------------------------------------------------
// RootLayout renders <html>/<head>/<body> itself, which React only allows as
// the actual document root — rendering it through Testing Library's `render`
// (which mounts into a container appended to document.body) would produce
// invalid nesting. Instead this inspects the plain React element tree
// RootLayout returns directly (JSX is just data until something renders it),
// which also means none of the child providers ever actually mount —
// nothing here needs the usual next/navigation or useAuth mocks.
// ---------------------------------------------------------------------------

/** Depth-first search for the first element whose `type` matches, by tag name or component reference. */
function find(element: unknown, type: unknown): ReactElement | null {
  if (!element || typeof element !== "object" || !("type" in element)) return null;
  const el = element as ReactElement;
  if (el.type === type) return el;
  const children = (el.props as { children?: unknown }).children;
  const candidates = Array.isArray(children) ? children : [children];
  for (const child of candidates) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}

describe("RootLayout", () => {
  const tree = RootLayout({ children: null }) as unknown as ReactElement;

  it("marks <html> with suppressHydrationWarning, since the no-flash script mutates its attributes pre-hydration", () => {
    expect(tree.type).toBe("html");
    expect((tree.props as { suppressHydrationWarning?: boolean }).suppressHydrationWarning).toBe(true);
  });

  it("renders the no-flash script referencing the shared storage key", () => {
    const script = find(tree, "script");
    expect(script).not.toBeNull();
    const html = (script!.props as { dangerouslySetInnerHTML?: { __html: string } }).dangerouslySetInnerHTML?.__html;
    expect(html).toBeTruthy();
    expect(html).toContain(THEME_STORAGE_KEY);
    expect(html).toContain("dataset.theme");
  });

  it("mounts ThemeProvider outermost, outside NextIntlClientProvider and AuthProvider", () => {
    const theme = find(tree, ThemeProvider);
    expect(theme).not.toBeNull();
    // Both other providers must be reachable INSIDE ThemeProvider's subtree.
    expect(find(theme, NextIntlClientProvider)).not.toBeNull();
    expect(find(theme, AuthProvider)).not.toBeNull();
  });
});
