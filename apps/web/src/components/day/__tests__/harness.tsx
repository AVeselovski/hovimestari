import { createTestQueryClient, queryWrapper, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { overview } from "@/components/targets/__tests__/support";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { queryKeys } from "@/lib/queryKeys";
import type { TargetChange } from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { DayTab } from "../DayTab";
import { defaultChanges } from "./fakeDays";
import { TODAY } from "./support";

// ---------------------------------------------------------------------------
// The Day tab under test: the tab with its providers, a client seeded with
// the targets answer, and helpers that read rows and toasts. The fake entry
// routes it runs against are in fakeDays.ts, and are exported here too, so a
// suite imports both from one place.
// ---------------------------------------------------------------------------

export { defaultChanges, FakeDays, notFound, refused, serve } from "./fakeDays";

/**
 * A client that already holds the targets answer, as the first-run gate
 * leaves it. A test of a day without targets passes the changes its server
 * has, so the cache and the day agree.
 */
export function seededClient(today = TODAY, changes: TargetChange[] = defaultChanges()): QueryClient {
  const client = registerTestQueryClient(createTestQueryClient());
  client.setQueryData(queryKeys.targets(), overview(changes, today, today));
  return client;
}

export function DayHarness(): ReactElement {
  return (
    <TodayProvider>
      <ToastProvider>
        <DayTab />
        <ToastRegion />
      </ToastProvider>
    </TodayProvider>
  );
}

export interface DayView {
  client: QueryClient;
  rerender: (ui: ReactElement) => void;
  unmount: () => void;
}

export function renderDay(client: QueryClient = seededClient()): DayView {
  const view = render(<DayHarness />, { wrapper: queryWrapper(client) });
  return { client, rerender: view.rerender, unmount: view.unmount };
}

/** The rows on screen, by entry name, in order. */
export function rowNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>("li[data-entry-id]")].map(
    (li) => within(li).getByRole("button", { name: /kcal/ }).querySelector(".line-clamp-2")!.textContent ?? "",
  );
}

/**
 * Records every toast as it appears, its text and its element, until `stop`.
 * Under load, rendering many rows can take longer than a toast stays on
 * screen, so a wait that reads the live toast can miss one that came and went.
 */
export function recordToasts(): { shown: string[]; elements: HTMLElement[]; stop: () => void } {
  const shown: string[] = [];
  const elements: HTMLElement[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const added = node.matches("[data-toast]") ? [node] : [...node.querySelectorAll<HTMLElement>("[data-toast]")];
        for (const toast of added) {
          shown.push(toast.textContent ?? "");
          elements.push(toast);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { shown, elements, stop: () => observer.disconnect() };
}

/** The toasts in the DOM, closing ones included. */
export function toasts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-toast]")];
}

/** The toast on screen, not closing. */
export function liveToast(): HTMLElement {
  const live = toasts().filter((t) => !t.hasAttribute("data-ending"));
  expect(live).toHaveLength(1);
  return live[0];
}

export const rowOf = (name: string): HTMLElement =>
  screen.getAllByRole("listitem").find((li) => li.textContent?.includes(name))!;
