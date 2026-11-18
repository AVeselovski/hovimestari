import { useEffect, useState, type RefObject } from "react";

/**
 * True while the page under `ref` is scrolled away from its top, so content
 * sits under a header that stays in view. It reads `<main>`, the shell's one
 * scroll container (`AppShell`), and changes only when that answer changes,
 * so a scroll re-renders nothing in between.
 */
export function useScrolledUnder(ref: RefObject<HTMLElement | null>): boolean {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    const main = ref.current?.closest("main");
    if (!main) return;
    const read = () => setUnder(main.scrollTop > 0);
    read();
    main.addEventListener("scroll", read, { passive: true });
    return () => main.removeEventListener("scroll", read);
  }, [ref]);
  return under;
}
