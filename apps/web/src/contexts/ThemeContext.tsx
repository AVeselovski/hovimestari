"use client";

import { THEME_COLORS, THEME_STORAGE_KEY } from "@/lib/theme/noFlashScript";
import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// ThemeContext owns the theme choice (light, dark or the device's), resolves
// what is painted right now, and keeps <html>'s `data-theme` and
// `data-theme-mode`, localStorage and the browser chrome colour in step.
//
// It reads its initial mode from `data-theme-mode`, which the pre-paint
// script (lib/theme/noFlashScript.ts) has already written from storage, so
// the provider and the script can never disagree about a stored value.
//
// `useTheme()` outside a provider returns a safe default instead of
// throwing, so a leaf component renders bare in a test.
// ---------------------------------------------------------------------------

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  /** The stored choice. */
  mode: ThemeMode;
  /** What is painted right now: `system` resolved against the device. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const DEFAULT_CONTEXT_VALUE: ThemeContextValue = {
  mode: "system",
  resolved: "light",
  setMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function readInitialMode(): ThemeMode {
  if (typeof document === "undefined") return "system";
  const fromAttr = document.documentElement.dataset.themeMode;
  return isThemeMode(fromAttr) ? fromAttr : "system";
}

/**
 * The `viewport` export renders one `theme-color` meta per colour scheme, so
 * the browser follows the device by itself. A fixed choice paints both with
 * that theme's colour. Following the device again puts each back on its own.
 */
function paintThemeColor(mode: ThemeMode): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[mode === "system" ? scheme : mode];
  }
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const [mode, setMode] = useState<ThemeMode>(readInitialMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readInitialMode()));

  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.themeMode = mode;
    paintThemeColor(mode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Storage refused (some private modes): the choice lasts until the page closes.
    }
  }, [mode]);

  // Follows the device live, only while the choice is "system".
  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    function handleChange(event: MediaQueryListEvent): void {
      const next: ResolvedTheme = event.matches ? "dark" : "light";
      setResolved(next);
      document.documentElement.dataset.theme = next;
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [mode]);

  const value: ThemeContextValue = { mode, resolved, setMode };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? DEFAULT_CONTEXT_VALUE;
}
