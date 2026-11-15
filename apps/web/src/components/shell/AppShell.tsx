"use client";

import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { OfflineStrip } from "./OfflineStrip";
import { SideRail } from "./SideRail";
import { TabBar } from "./TabBar";
import { tabOf } from "./tabs";

/**
 * The signed-in frame. The viewport's full height, with `<main>` as the only
 * scroll container: the header and the tab bar never move, and a sheet locks
 * `<main>` alone. Below `md` the tab bar sits at the bottom. From `md` the
 * side rail takes its place. Both are mounted and CSS shows one, so the
 * first paint is right at any width. Each tab page owns its content and the
 * shell never changes to add a screen.
 */
export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const active = tabOf(usePathname());
  return (
    <div className="flex h-dvh bg-bg">
      <SideRail active={active} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader active={active} />
        <OfflineStrip />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>
        <TabBar active={active} />
      </div>
    </div>
  );
}
