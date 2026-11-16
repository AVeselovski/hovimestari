import { useEffect } from "react";

/** The locks held right now, and what the first one found on `<main>`. */
let holders = 0;
let saved: { main: HTMLElement; overflow: string; scrollTop: number } | null = null;

/**
 * Holds `<main>` still while `active`: the app shell's one scroll container
 * (docs/app/mobile-responsive-shell.md). An overlay on Base UI's Drawer runs
 * with `modal="trap-focus"`, because Base UI's own scroll lock targets
 * `<html>`/`<body>`, which never scroll here. This locks `<main>` instead and,
 * when `active` turns false or the caller unmounts, puts back both its
 * `overflow` and the exact `scrollTop`, so the page never jumps.
 *
 * Locks are counted. Two overlays that know nothing of each other (the nav
 * drawer, and a sheet that opens on its own) can open and close in either
 * order: the first lock saves `<main>` as it was, and only the last one to
 * let go puts it back.
 *
 * Every overlay that uses it mounts inside the vault layout, whose `<main>`
 * persists; navigating away unmounts the overlay (running the cleanup) before
 * a different `<main>` could exist.
 */
export function useMainScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector("main");
    if (!main) return;
    if (holders === 0) {
      saved = { main, overflow: main.style.overflow, scrollTop: main.scrollTop };
      main.style.overflow = "hidden";
    }
    holders += 1;
    return () => {
      holders -= 1;
      if (holders > 0 || !saved) return;
      saved.main.style.overflow = saved.overflow;
      saved.main.scrollTop = saved.scrollTop;
      saved = null;
    };
  }, [active]);
}
