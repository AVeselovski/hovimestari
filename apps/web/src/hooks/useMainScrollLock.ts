import { useEffect } from "react";

/** The locks held right now, and what the first one found on `<main>`. */
let holders = 0;
let saved: { main: HTMLElement; overflow: string; scrollTop: number; path: string; follow: () => void } | null = null;

/**
 * Holds `<main>` still while `active`: the app shell's one scroll container
 * (docs/app/mobile-responsive-shell.md). An overlay on Base UI's Drawer runs
 * with `modal="trap-focus"`, because Base UI's own scroll lock targets
 * `<html>`/`<body>`, which never scroll here. This locks `<main>` instead and,
 * when `active` turns false or the caller unmounts, puts back its `overflow`
 * and its `scrollTop`, so the page never jumps.
 *
 * The `scrollTop` put back is the last one `<main>` had while held, not the
 * one it had when the lock was taken. A person cannot scroll a held `<main>`,
 * but the browser's scroll anchoring can: when a row is added or removed
 * above what shows, behind a sheet, it moves `scrollTop` by that row's
 * height so the page holds still. Putting back the older value would move
 * the page by the row the moment the sheet closed.
 *
 * The cost: the browser also moves `scrollTop` when content behind a sheet
 * shrinks and the page can no longer scroll as far, and that lower value is
 * the one remembered. If the content grows back before the sheet closes, the
 * page comes back higher up than it was when the sheet opened. This is the
 * trade the lock makes. No sheet in the app shrinks and regrows the page
 * behind it today.
 *
 * Locks are counted. Two overlays that know nothing of each other (the nav
 * drawer, and a sheet that opens on its own) can open and close in either
 * order: the first lock saves `<main>` as it was, and only the last one to
 * let go puts it back.
 *
 * Every overlay that uses it mounts inside the signed-in layout, whose
 * `<main>` persists. Navigating away unmounts the overlay (running the
 * cleanup) before a different `<main>` could exist.
 *
 * The `scrollTop` is put back only on the page the lock was taken on. A
 * link inside a sheet, such as an entry's Open recipe, leaves for another
 * page while the sheet is open. That page shows in the same `<main>` and
 * sets its own scroll as it mounts, and the sheet unmounts, letting go,
 * after that. By then the address is the new page's, so the lock gives back
 * `overflow` alone and leaves the scroll to the page now showing. A change
 * of the address's query under a sheet is the same page, and its scroll is
 * put back.
 */
export function useMainScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector("main");
    if (!main) return;
    if (holders === 0) {
      const held = {
        main,
        overflow: main.style.overflow,
        scrollTop: main.scrollTop,
        path: window.location.pathname,
        follow: () => {
          held.scrollTop = main.scrollTop;
        },
      };
      saved = held;
      main.addEventListener("scroll", held.follow, { passive: true });
      main.style.overflow = "hidden";
    }
    holders += 1;
    return () => {
      holders -= 1;
      if (holders > 0 || !saved) return;
      saved.main.removeEventListener("scroll", saved.follow);
      saved.main.style.overflow = saved.overflow;
      if (window.location.pathname === saved.path) saved.main.scrollTop = saved.scrollTop;
      saved = null;
    };
  }, [active]);
}
