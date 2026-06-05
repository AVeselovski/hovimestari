import { useEffect, useState } from "react";
import type { RecipeSectionKind } from "./shoppingList.js";

export type UrlKind = RecipeSectionKind;

const STORAGE_KEY = "hovi:shoppingListUrls";

type UrlMap = Record<string, string>;

function loadInitial(): UrlMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: UrlMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function makeKey(kind: UrlKind, id: string): string {
  return `${kind}:${id}`;
}

// Per-device only. No cross-tab `storage`-event sync: each phone is independent
// and the two tabs that touch this map (Lista, Vakiot) are never mounted
// simultaneously under the router.
export function useShoppingListUrls(): {
  get: (kind: UrlKind, id: string) => string | undefined;
  set: (kind: UrlKind, id: string, url: string | undefined) => void;
  urls: UrlMap;
} {
  const [urls, setUrls] = useState<UrlMap>(() => loadInitial());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
  }, [urls]);

  const get = (kind: UrlKind, id: string): string | undefined =>
    urls[makeKey(kind, id)];

  const set = (kind: UrlKind, id: string, url: string | undefined): void => {
    const key = makeKey(kind, id);
    setUrls((prev) => {
      if (url === undefined) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === url) return prev;
      return { ...prev, [key]: url };
    });
  };

  return { get, set, urls };
}
