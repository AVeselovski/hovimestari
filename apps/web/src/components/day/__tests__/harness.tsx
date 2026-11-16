import { createTestQueryClient, queryWrapper, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { change, overview } from "@/components/targets/__tests__/support";
import { TodayProvider } from "@/components/targets/TodayProvider";
import { ToastProvider, ToastRegion } from "@/components/ui/Toast";
import { getDay } from "@/lib/api/days";
import { patchEntry, removeEntry, restoreEntry, setEntriesStatus } from "@/lib/api/entries";
import { getTargets } from "@/lib/api/targets";
import { queryKeys } from "@/lib/queryKeys";
import {
  entryFigures,
  gramsForPortion,
  type Day,
  type Entry,
  type EntryPatchBody,
  type EntryStatus,
} from "@hovimestari/types";
import type { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { DayTab } from "../DayTab";
import { RANGES, TODAY, dayOf } from "./support";

// ---------------------------------------------------------------------------
// The Day tab under test, against a small fake of the entry routes that
// keeps the server's rules that matter on screen: an entry keeps its place
// (position) through every write, a restore brings it back at its place and
// answers created (a second restore answers replayed, one past its window
// 404), a status change skips entries already in that state and answers the ids it
// changed, a move of an eaten entry to a future date plans it, and every
// write answers the days it changed. The test file mocks the API modules.
// ---------------------------------------------------------------------------

export class FakeDays {
  today = TODAY;
  entries: Entry[] = [];
  removed = new Map<string, Entry>();
  /** Removed entries past their restore window: a restore answers 404. */
  expired = new Set<string>();
  /** Portion weights by id, for amounts sent as a portion count. */
  portionGrams = new Map<string, number>();

  constructor(entries: Entry[] = []) {
    this.entries = entries.map((e) => ({ ...e }));
  }

  day(date: string): Day {
    const on = this.entries.filter((e) => e.date === date).sort((a, b) => a.position - b.position);
    return dayOf(on, date, this.today);
  }

  status(ids: readonly string[], status: EntryStatus) {
    const changed: string[] = [];
    for (const id of ids) {
      const e = this.entries.find((x) => x.id === id);
      if (!e || e.status === status || (status === "eaten" && e.date > this.today)) continue;
      e.status = status;
      changed.push(id);
    }
    const dates = [...new Set(this.entries.filter((e) => changed.includes(e.id)).map((e) => e.date))];
    return { changedIds: changed, days: dates.map((d) => this.day(d)) };
  }

  patch(id: string, patch: EntryPatchBody) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) throw notFound();
    const from = e.date;
    if (patch.date !== undefined) {
      e.date = patch.date;
      if (patch.date > this.today && patch.status === undefined) e.status = "planned";
    }
    if (patch.status !== undefined) e.status = patch.status;
    if (patch.amount !== undefined) {
      if ("grams" in patch.amount) {
        e.grams = patch.amount.grams;
        e.portion = null;
      } else {
        const grams = gramsForPortion(patch.amount.count, this.portionGrams.get(patch.amount.portionId) ?? 0);
        e.grams = grams;
        e.portion = {
          id: patch.amount.portionId,
          unit: null,
          name: e.portion?.name ?? "Portion",
          count: patch.amount.count,
        };
      }
      e.figures = entryFigures(e.basis, { per: "100g", grams: e.grams });
    }
    if (patch.count !== undefined) {
      e.count = patch.count;
      e.figures = entryFigures(e.basis, { per: "meal", count: patch.count });
    }
    if (patch.name !== undefined) e.name = patch.name;
    if (patch.figures !== undefined) {
      e.basis = patch.figures;
      e.figures = patch.figures;
    }
    if (patch.note !== undefined) e.note = patch.note;
    const dates = [...new Set([from, e.date])];
    return { entry: { ...e }, days: dates.map((d) => this.day(d)), outcome: "changed" as const };
  }

  remove(id: string) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) throw notFound();
    this.entries = this.entries.filter((x) => x.id !== id);
    this.removed.set(id, e);
    return { days: [this.day(e.date)] };
  }

  /** A restore of an entry already back answers 200 replayed, as the server does. Past its window, 404. */
  restore(id: string) {
    const back = this.entries.find((x) => x.id === id);
    if (back) return { entry: { ...back }, days: [this.day(back.date)], outcome: "replayed" as const };
    const e = this.removed.get(id);
    if (!e || this.expired.has(id)) throw notFound();
    this.removed.delete(id);
    this.entries.push(e);
    return { entry: { ...e }, days: [this.day(e.date)], outcome: "created" as const };
  }
}

/** A 404 as axios rejects it. */
export function notFound(): Error {
  return Object.assign(new Error("Request failed with status code 404"), {
    isAxiosError: true,
    response: { status: 404, data: { code: "entry_not_found" } },
  });
}

/** Puts the fake behind the mocked API functions. Each call's arguments stay on the mocks. */
export function serve(server: FakeDays): void {
  jest.mocked(getDay).mockImplementation(async (date) => server.day(date));
  jest.mocked(setEntriesStatus).mockImplementation(async (ids, status) => server.status(ids, status));
  jest.mocked(patchEntry).mockImplementation(async (id, patch) => server.patch(id, patch));
  jest.mocked(removeEntry).mockImplementation(async (id) => server.remove(id));
  jest.mocked(restoreEntry).mockImplementation(async (id) => server.restore(id));
  jest
    .mocked(getTargets)
    .mockImplementation(async () =>
      overview(
        [change("2026-01-01", [RANGES.energyKcal.lower, RANGES.energyKcal.upper], [140, 180])],
        server.today,
        server.today,
      ),
    );
}

/** A client that already holds the targets answer, as the first-run gate leaves it. */
export function seededClient(today = TODAY): QueryClient {
  const client = registerTestQueryClient(createTestQueryClient());
  client.setQueryData(
    queryKeys.targets(),
    overview([change("2026-01-01", [RANGES.energyKcal.lower, RANGES.energyKcal.upper], [140, 180])], today, today),
  );
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
