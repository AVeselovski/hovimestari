// ---------------------------------------------------------------------------
// The pre-paint theme script and the storage key it reads, shared between
// app/layout.tsx (which injects the script) and the tests that run it, so the
// two can never disagree about the key or the parsing.
//
// The script is plain JS in a string on purpose: it runs synchronously in
// <head>, before hydration and before first paint, so <html> carries the
// right data-theme on the very first painted frame. A module or deferred
// script would paint the wrong theme for one frame first.
//
// The choice is kept per device. No stored choice means "follow the device".
// When storage throws (some private modes), the page paints light.
// ---------------------------------------------------------------------------

export const THEME_STORAGE_KEY = "hovi-theme";

/** The colour the browser chrome takes in each theme: the page background. */
export const THEME_COLORS = { light: "#f6efe1", dark: "#121a15" } as const;

export const NO_FLASH_SCRIPT = `(function(){var e=document.documentElement;try{var m=localStorage.getItem("${THEME_STORAGE_KEY}");if(m!=="light"&&m!=="dark"&&m!=="system")m="system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);e.dataset.theme=d?"dark":"light";e.dataset.themeMode=m;}catch(x){e.dataset.theme="light";e.dataset.themeMode="system";}})()`;
