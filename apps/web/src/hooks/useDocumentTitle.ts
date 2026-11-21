import { APP_NAME } from "@/lib/appName";
import { useEffect } from "react";

/**
 * Names the browser's title after what a page shows, such as a recipe's
 * name, where the route's own title can only name its tab: the page's data
 * is read on the device, after the route has set its title. "Shakshuka ·
 * Hovimestari" while `name` is known, and the route's title again when the
 * page leaves.
 *
 * - It rewrites the text of the title the framework rendered, in place. A
 *   `document.title` assignment would swap that text for a new node, and the
 *   framework's later titles would go to a node no longer in the document.
 * - The framework may write the route's title again after the page has
 *   shown, as its metadata arrives. The name is put back each time, and the
 *   route's latest title is the one given back when the page leaves.
 */
export function useDocumentTitle(name: string | undefined): void {
  useEffect(() => {
    if (!name) return;
    const mine = `${name} · ${APP_NAME}`;
    let theirs: string | null = null;
    const textOf = (): Text | null => {
      const text = document.querySelector("head > title")?.firstChild;
      return text instanceof Text ? text : null;
    };
    const apply = (): void => {
      const text = textOf();
      if (text === null || text.data === mine) return;
      theirs = text.data;
      text.data = mine;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      const text = textOf();
      // The next route may have set its own title already. Only this page's title is taken back.
      if (text !== null && text.data === mine && theirs !== null) text.data = theirs;
    };
  }, [name]);
}
