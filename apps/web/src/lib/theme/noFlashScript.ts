// ---------------------------------------------------------------------------
// The pre-paint theme script and the storage key it reads, as constants
// shared between app/layout.tsx (which injects the script) and the tests
// that verify it — one source, so the two can never disagree about the key
// name or the parsing logic.
//
// The script is deliberately plain JS glued together as a string rather than
// authored as a normal function and stringified: it must run synchronously in
// <head>, before hydration and before first paint, so `<html>` already
// carries the right data-theme attribute on the very first painted frame
// (docs/design/ui-overhaul.md §d). A module or deferred script would paint
// the wrong theme for one frame first.
// ---------------------------------------------------------------------------

export const THEME_STORAGE_KEY = "fa-theme";

export const NO_FLASH_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.dataset.themeMode=m;}catch(e){document.documentElement.dataset.theme="dark";document.documentElement.dataset.themeMode="system";}})()`;
