"use client";

import { THEME_STORAGE_KEY } from "@/lib/theme/noFlashScript";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// ThemeContext — owns the user's theme choice (light / dark / system),
// derives what is actually painted right now, and keeps <html>'s
// `data-theme` / `data-theme-mode` attributes and localStorage in sync with
// it. See docs/design/ui-overhaul.md §d for the full contract.
//
// Reads its INITIAL mode from `document.documentElement.dataset.themeMode`
// rather than localStorage directly — the no-flash script
// (lib/theme/noFlashScript.ts) has already parsed localStorage and written
// that attribute before this component ever mounts, so provider and script
// can never disagree about how a stored value parses.
//
// No third-party theme hook is used (design doc §g): a hand-rolled
// `useTheme()` can return a documented safe default when called outside a
// provider, which 150+ existing test files that render leaf components bare
// rely on — a throw would break every one of them for a concern (painting)
// those tests have no opinion on.
// ---------------------------------------------------------------------------

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  /** The user's stored choice. */
  mode: ThemeMode;
  /** What is actually painted right now — `system` resolved against the OS. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

/** Returned by useTheme() outside a provider — see the module doc above. */
const DEFAULT_CONTEXT_VALUE: ThemeContextValue = {
  mode: "system",
  resolved: "dark",
  setMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
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

export function ThemeProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [mode, setMode] = useState<ThemeMode>(readInitialMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readInitialMode()));

  // Writes the attribute pair and persists the choice whenever the mode
  // changes (including the very first render, so a mode read from the
  // attribute but never persisted — e.g. the script's own catch-block
  // fallback — still gets written to storage).
  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.themeMode = mode;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Private mode / disabled storage — the choice just doesn't persist.
    }
  }, [mode]);

  // Live-follows the OS preference only while the mode is "system" —
  // subscribing and unsubscribing as the mode changes, per the contract.
  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(event: MediaQueryListEvent) {
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
  const ctx = useContext(ThemeContext);
  return ctx ?? DEFAULT_CONTEXT_VALUE;
}
