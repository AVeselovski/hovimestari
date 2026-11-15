import type { IconName } from "@/components/Icon";

/** The four tabs, in order. Each label is `shell.tabs.<key>` in the catalog. */
export const TABS = [
  { key: "day", href: "/", icon: "day" },
  { key: "recipes", href: "/recipes", icon: "recipes" },
  { key: "groceries", href: "/groceries", icon: "groceries" },
  { key: "settings", href: "/settings", icon: "settings" },
] as const satisfies ReadonlyArray<{ key: string; href: string; icon: IconName }>;

export type TabKey = (typeof TABS)[number]["key"];

/** The tab a path belongs to: Day for `/`, the others for their path and everything under it. */
export function tabOf(pathname: string | null): TabKey | null {
  if (!pathname) return null;
  if (pathname === "/") return "day";
  const tab = TABS.find((t) => t.href !== "/" && (pathname === t.href || pathname.startsWith(`${t.href}/`)));
  return tab?.key ?? null;
}
