import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import {
  createTestQueryClient,
  deferred,
  queryWrapper,
  registerTestQueryClient,
} from "@/__tests__/helpers/queryClient";
import { change, overview } from "@/components/targets/__tests__/support";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import { getDaySummaries } from "@/lib/api/days";
import { formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { queryKeys } from "@/lib/queryKeys";
import type { DaySummaryList, TargetChange } from "@hovimestari/types";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WeekSheet } from "../WeekSheet";
import { FakeDays, defaultChanges } from "./harness";
import { estimateEntry, foodEntry } from "./support";

jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));

// ---------------------------------------------------------------------------
// The week sheet on its own, over a fake of `GET /days?from=&to=` that answers
// each day exactly as the day's own read would (FakeDays.range). The clock
// runs from Wednesday 18 November 2026, and dates format as a British phone.
// ---------------------------------------------------------------------------

const TODAY = "2026-11-18";
beforeEach(() => {
  clockFrom(`${TODAY}T10:00:00Z`);
  setTestLocale("en-GB");
  jest.mocked(getDaySummaries).mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  onlineManager.setOnline(true);
});

function todayState(today: string | null = TODAY): TodayState {
  return { today, holding: false, confirm: "fresh", unconfirmed: false, retry: () => {} };
}

function serveRange(server: FakeDays): void {
  jest.mocked(getDaySummaries).mockImplementation(async (from, to) => server.range(from, to));
}

interface Rendered {
  client: QueryClient;
  onPick: jest.Mock;
}

function renderWeek({
  shownDate = TODAY,
  changes = defaultChanges(),
  client = registerTestQueryClient(createTestQueryClient()),
}: { shownDate?: string; changes?: TargetChange[]; client?: QueryClient } = {}): Rendered {
  client.setQueryData(queryKeys.targets(), overview(changes, TODAY, TODAY));
  const onPick = jest.fn();
  render(
    <TodayContext.Provider value={todayState()}>
      <WeekSheet open onClose={() => {}} shownDate={shownDate} onPick={onPick} />
    </TodayContext.Provider>,
    { wrapper: queryWrapper(client) },
  );
  return { client, onPick };
}

/** A server whose week of 16 to 22 November holds a past day with a plan never marked eaten, today with an estimate, and a planned future day. */
function weekServer(): FakeDays {
  const server = new FakeDays([
    foodEntry("Rahka", 250, { date: "2026-11-16" }),
    foodEntry("Kaurapuuro", 300, { date: "2026-11-16", status: "planned" }),
    foodEntry("Rahka", 200, { date: TODAY }),
    estimateEntry(
      "Lounas",
      { energyKcal: 650, proteinG: 32, carbsG: 70, fatG: 20 },
      { date: TODAY, status: "planned" },
    ),
    foodEntry("Rahka", 400, { date: "2026-11-20", status: "planned" }),
  ]);
  server.today = TODAY;
  return server;
}

const row = (date: string) => document.querySelector<HTMLElement>(`[data-week-row="${date}"]`)!;
const cell = (date: string, key: string) => row(date).querySelector<HTMLElement>(`[data-week-figure="${key}"]`)!;

/** What a cell shows on screen: its text without the screen-reader-only parts. */
function shown(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return copy.textContent ?? "";
}

const loaded = () =>
  waitFor(() => expect(document.querySelector("[data-week-frame]")).not.toHaveAttribute("aria-busy"));

describe("WeekSheet, the figures", () => {
  it("shows each day's Eaten and Planned for calories and protein exactly as that day's own summary has them", async () => {
    const server = weekServer();
    serveRange(server);
    renderWeek();
    await loaded();
    for (let d = 16; d <= 22; d += 1) {
      const date = `2026-11-${d}`;
      const day = server.day(date);
      if (day.entryCount === 0) {
        expect(within(row(date)).getByText("No entries")).toBeInTheDocument();
        continue;
      }
      const approx = (estimate: boolean) => (estimate ? "≈" : "");
      expect(shown(cell(date, "energy-eaten"))).toBe(
        approx(day.eaten.includesEstimate) + formatKcal(day.eaten.figures.energyKcal),
      );
      expect(shown(cell(date, "energy-withPlan"))).toBe(
        approx(day.withPlan.includesEstimate) + formatKcal(day.withPlan.figures.energyKcal),
      );
      expect(shown(cell(date, "protein-eaten"))).toBe(
        approx(day.eaten.includesEstimate) + formatMacroGrams(day.eaten.figures.proteinG),
      );
      expect(shown(cell(date, "protein-withPlan"))).toBe(
        approx(day.withPlan.includesEstimate) + formatMacroGrams(day.withPlan.figures.proteinG),
      );
    }
  });

  it("never shows a past day's plan under Eaten: the planned entries never marked eaten count under Planned only", async () => {
    const server = weekServer();
    serveRange(server);
    renderWeek();
    await loaded();
    const past = server.day("2026-11-16");
    expect(past.unmarkedCount).toBe(1);
    expect(past.withPlan.figures.energyKcal).toBeGreaterThan(past.eaten.figures.energyKcal);
    // The cells in the row's order: Eaten before Planned, for each macro.
    const keys = [...row("2026-11-16").querySelectorAll("[data-week-figure]")].map((c) =>
      c.getAttribute("data-week-figure"),
    );
    expect(keys).toEqual(["energy-eaten", "energy-withPlan", "protein-eaten", "protein-withPlan"]);
    expect(shown(cell("2026-11-16", "energy-eaten"))).toBe(formatKcal(past.eaten.figures.energyKcal));
    expect(shown(cell("2026-11-16", "energy-eaten"))).not.toBe(formatKcal(past.withPlan.figures.energyKcal));
    expect(row("2026-11-16").querySelector("th")).toHaveTextContent("1 planned entry was never marked eaten.");
  });

  it("speaks no position for a past row's eaten cells when it holds only planned entries, and keeps the Planned one", async () => {
    const server = weekServer();
    server.entries.push(foodEntry("Rahka", 250, { date: "2026-11-17", status: "planned" }));
    serveRange(server);
    renderWeek();
    await loaded();
    // 250 g of quark is 148 kcal and 31.1 g protein, planned on Tuesday and never marked eaten.
    expect(cell("2026-11-17", "energy-eaten")).toHaveTextContent(/^0$/);
    expect(cell("2026-11-17", "protein-eaten")).toHaveTextContent(/^0\.0$/);
    expect(cell("2026-11-17", "energy-withPlan")).toHaveTextContent(/^148 below the range$/);
    expect(cell("2026-11-17", "protein-withPlan")).toHaveTextContent(/^31\.1 below the floor$/);
  });

  it('says "No entries" on an empty past row, muted, in the words the Day summary uses', async () => {
    serveRange(weekServer());
    renderWeek();
    await loaded();
    // Tuesday 17 November is past and empty.
    const empty = row("2026-11-17").querySelector<HTMLElement>("[data-week-empty]")!;
    expect(empty).toHaveTextContent(/^No entries$/);
    expect(empty.className.split(/\s+/)).toContain("text-ink-muted");
    expect(row("2026-11-17").querySelectorAll("[data-week-figure]")).toHaveLength(0);
  });

  it("tells a screen reader each figure's position and an estimate, and names each row's button by its date alone", async () => {
    serveRange(weekServer());
    renderWeek();
    await loaded();
    // 200 g of quark is 119 kcal and 24.9 g protein against 1900 to 2200 and 140 to 180.
    expect(cell(TODAY, "energy-eaten")).toHaveTextContent(/^119 below the range$/);
    expect(cell(TODAY, "protein-eaten")).toHaveTextContent(/^24\.9 below the floor$/);
    expect(cell(TODAY, "energy-withPlan")).toHaveTextContent(/^≈estimated 769 below the range$/);
    expect(screen.getByRole("button", { name: "Today, Wednesday 18 November" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monday 16 November" })).toBeInTheDocument();
  });

  it("states no verdict: every figure is in ink, the same on every day", async () => {
    serveRange(weekServer());
    renderWeek();
    await loaded();
    // Every figure cell has the same classes but its gap, whatever its figure or position.
    const classes = new Set(
      [...document.querySelectorAll<HTMLElement>("[data-week-figure]")].map((c) =>
        c.className
          .split(/\s+/)
          .filter((t) => !/^pl-/.test(t))
          .join(" "),
      ),
    );
    expect(classes.size).toBe(1);
    const tokens = [...classes][0]!.split(" ");
    expect(tokens).toContain("text-ink");
    expect(tokens.filter((t) => /^text-(accent|energy|protein|carbs|fat)/.test(t))).toEqual([]);
  });
});

describe("WeekSheet, the gauges", () => {
  it("puts the ticks of two days with the same targets at the same place, and keeps a day's ticks when its figures change", async () => {
    const server = weekServer();
    serveRange(server);
    const { client } = renderWeek();
    await loaded();
    const ticks = (date: string, macro: string) =>
      ["tick-lower", "tick-upper", "band"].map(
        (part) =>
          row(date).querySelector<HTMLElement>(`[data-gauge="${macro}"] [data-gauge-part="${part}"]`)!.style.left,
      );
    for (const macro of ["energy", "protein"]) {
      expect(ticks("2026-11-16", macro)).toEqual(ticks("2026-11-21", macro));
      expect(ticks("2026-11-16", macro)[0]).not.toBe("");
    }
    const before = ticks(TODAY, "energy");
    const eatenBefore = row(TODAY).querySelector<HTMLElement>('[data-gauge="energy"] [data-gauge-part="eaten"]')!;
    const widthBefore = eatenBefore.style.width;
    server.entries.push(foodEntry("Rahka", 600, { date: TODAY }));
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.dayRanges() });
    });
    await waitFor(() =>
      expect(
        row(TODAY).querySelector<HTMLElement>('[data-gauge="energy"] [data-gauge-part="eaten"]')!.style.width,
      ).not.toBe(widthBefore),
    );
    expect(ticks(TODAY, "energy")).toEqual(before);
    // The same day's new figures ease in the same gauge.
    expect(row(TODAY).querySelector('[data-gauge="energy"] [data-gauge-part="eaten"]')).toBe(eatenBefore);
  });

  it("draws mini gauges: a 6 px track and a band wide enough to keep the ticks apart", async () => {
    const server = weekServer();
    server.changes = [change("2026-01-01", [2000, 2000], [150, 150])];
    serveRange(server);
    renderWeek({ changes: server.changes });
    await loaded();
    const gauge = row(TODAY).querySelector<HTMLElement>('[data-gauge="protein"]')!;
    expect(gauge).toHaveAttribute("data-gauge-size", "mini");
    expect(gauge.querySelector('[data-gauge-part="track"]')!.className.split(/\s+/)).toContain("h-1.5");
    const band = gauge.querySelector<HTMLElement>('[data-gauge-part="band"]')!;
    expect(parseFloat(band.style.width)).toBeCloseTo(6, 5);
  });

  it("paints a new week's gauges fresh, so no fill eases from the week before", async () => {
    serveRange(weekServer());
    renderWeek();
    await loaded();
    const first = () => document.querySelector("tbody[data-week-row]")!;
    const mondayGauge = first().querySelector('[data-gauge="energy"]');
    expect(mondayGauge).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(first()).toHaveAttribute("data-week-row", "2026-11-23"));
    await waitFor(() => expect(first().querySelector('[data-gauge="energy"]')).not.toBeNull());
    expect(first().querySelector('[data-gauge="energy"]')).not.toBe(mondayGauge);
    expect(mondayGauge!.isConnected).toBe(false);
  });
});

/** Everything about the table's frame that must not change between states: rows, their height classes, the heads. */
function frame(): unknown {
  const heights = (el: Element) =>
    el.className
      .split(/\s+/)
      .filter((c) => /^(md:)?(min-)?h-/.test(c))
      .sort();
  const rows = [...document.querySelectorAll("tbody[data-week-row]")].map((body) => {
    const [figures, gauges] = [...body.querySelectorAll(":scope > tr")];
    return {
      th: heights(body.querySelector("th button")!),
      figures: [...new Set([...figures!.querySelectorAll("td")].map((td) => heights(td).join(" ")))],
      gauges: [...new Set([...gauges!.querySelectorAll("td")].map((td) => heights(td).join(" ")))],
      gaugeCells: gauges!.querySelectorAll("td").length,
    };
  });
  const heads = [...document.querySelectorAll("thead th")].map((th) => th.textContent);
  return { rows, heads, caption: document.querySelector("caption")?.textContent };
}

describe("WeekSheet, across states", () => {
  it("keeps the same rows, row heights and heads loading, loaded, failed, offline and from week to week", async () => {
    const answer = deferred<DaySummaryList>();
    const server = weekServer();
    jest.mocked(getDaySummaries).mockReturnValueOnce(answer.promise);
    jest.mocked(getDaySummaries).mockImplementation(async (from, to) => server.range(from, to));
    renderWeek();
    const loading = frame();
    expect(document.querySelectorAll('tbody [data-gauge="frame"]')).toHaveLength(14);

    await act(async () => answer.resolve(server.range("2026-11-16", "2026-11-22")));
    await loaded();
    expect(frame()).toEqual(loading);

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() =>
      expect(document.querySelector("tbody[data-week-row]")).toHaveAttribute("data-week-row", "2026-11-23"),
    );
    await loaded();
    const nextWeek = frame() as { rows: unknown; heads: unknown };
    expect(nextWeek.rows).toEqual((loading as { rows: unknown }).rows);
    expect(nextWeek.heads).toEqual((loading as { heads: unknown }).heads);
  });

  it("lays a failure over the same frame, and Try again reads the week", async () => {
    const server = weekServer();
    jest.mocked(getDaySummaries).mockRejectedValueOnce(new Error("boom"));
    jest.mocked(getDaySummaries).mockImplementation(async (from, to) => server.range(from, to));
    renderWeek();
    const loading = frame();
    expect(await screen.findByText("This week did not load.")).toBeInTheDocument();
    expect(frame()).toEqual(loading);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loaded();
    expect(screen.queryByText("This week did not load.")).not.toBeInTheDocument();
    expect(frame()).toEqual(loading);
  });

  it("covers whole rows with a failure: three rows tall from a row's edge, phone and md", async () => {
    jest.mocked(getDaySummaries).mockRejectedValue(new Error("boom"));
    renderWeek();
    expect(await screen.findByText("This week did not load.")).toBeInTheDocument();
    const tokens = (el: Element) => el.getAttribute("class")!.split(/\s+/);
    const notice = tokens(document.querySelector("[data-week-notice]")!);
    const rowHeight = (prefix: string) =>
      Number(
        tokens(row(TODAY).querySelector("th button")!)
          .find((c) => c.startsWith(`${prefix}min-h-`))!
          .slice(`${prefix}min-h-`.length),
      );
    // The head's stated height: the h-* of a cell in each of its two rows.
    const headHeight = (prefix: string) =>
      [...document.querySelectorAll("[data-week-table] thead tr")].reduce((sum, tr) => {
        const step = tokens(tr.querySelector("th")!).find((c) => new RegExp(`^${prefix}h-[\\d.]+$`).test(c))!;
        return sum + Number(step.slice(`${prefix}h-`.length));
      }, 0);
    // Tailwind's spacing unit is 0.25rem, so h-33 is three rows of min-h-11, and the top is the head and two rows.
    expect(notice).toContain(`h-${3 * rowHeight("")}`);
    expect(notice).toContain(`md:h-${3 * rowHeight("md:")}`);
    expect(notice).toContain(`top-${headHeight("") + 2 * rowHeight("")}`);
    expect(notice).toContain(`md:top-${headHeight("md:") + 2 * rowHeight("md:")}`);
    expect(notice.filter((c) => /translate|top-1\/2/.test(c))).toEqual([]);
  });

  it("says the week needs a connection offline, over the same frame", async () => {
    serveRange(weekServer());
    onlineManager.setOnline(false);
    const shownFrame = (() => {
      renderWeek();
      return frame();
    })();
    expect(await screen.findByText("This week needs a connection.")).toBeInTheDocument();
    expect(frame()).toEqual(shownFrame);
    expect(getDaySummaries).not.toHaveBeenCalled();
  });
});

describe("WeekSheet, days without targets", () => {
  it("says once, under the table, from when the targets apply, in the week the first change starts in and not in the week after", async () => {
    const server = weekServer();
    server.changes = [change("2026-11-19", [1900, 2200], [140, 180])];
    serveRange(server);
    renderWeek({ changes: server.changes });
    await loaded();
    const line = () => document.querySelector("[data-week-targets-line]");
    expect(line()).toHaveTextContent("Targets apply from 19 November 2026.");
    expect(screen.getAllByText(/Targets apply from/)).toHaveLength(1);
    // The days before the change keep their gauges' room empty, the days from it have gauges.
    expect(row(TODAY).querySelector("[data-gauge]")).toBeNull();
    expect(row("2026-11-19").querySelector('[data-gauge="energy"]')).not.toBeNull();
    // The table comes first and the line after it.
    const table = document.querySelector("[data-week-table]")!;
    expect(table.compareDocumentPosition(line()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() =>
      expect(document.querySelector("tbody[data-week-row]")).toHaveAttribute("data-week-row", "2026-11-23"),
    );
    await loaded();
    // The week after keeps the line's room, empty and hidden, so the sheet's held height includes it.
    expect(line()).toBeInTheDocument();
    expect(line()).toBeEmptyDOMElement();
    expect(line()).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(/Targets apply from/)).not.toBeInTheDocument();
  });

  it("keeps the targets line's room, the same height, in a week without it and the week with it", async () => {
    const server = weekServer();
    server.changes = [change("2026-11-19", [1900, 2200], [140, 180])];
    serveRange(server);
    // The sheet opens on a week from the change on, then steps back into the week before it.
    renderWeek({ shownDate: "2026-11-25", changes: server.changes });
    await loaded();
    const line = () => document.querySelector("[data-week-targets-line]");
    const heightOf = (el: Element | null) =>
      (el?.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) => /^(?:md:)?(?:min-h-|h-|mt-|leading-|text-(?:xs|sm|base))/.test(c))
        .sort();
    expect(line()).toBeInTheDocument();
    const without = heightOf(line());
    expect(without).toEqual(expect.arrayContaining(["min-h-4", "md:min-h-5"]));
    expect(line()!.getAttribute("class")!.split(/\s+/)).toContain("invisible");

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await waitFor(() => expect(line()).toHaveTextContent("Targets apply from 19 November 2026."));
    expect(heightOf(line())).toEqual(without);
    expect(line()!.getAttribute("class")!.split(/\s+/)).not.toContain("invisible");
    expect(line()).not.toHaveAttribute("aria-hidden");
  });

  it("gives a user with no targets at all no gauge, no line and no Set targets, loading or loaded", async () => {
    const server = weekServer();
    server.changes = [];
    const answer = deferred<DaySummaryList>();
    jest.mocked(getDaySummaries).mockReturnValueOnce(answer.promise);
    jest.mocked(getDaySummaries).mockImplementation(async (from, to) => server.range(from, to));
    renderWeek({ changes: [] });
    expect(document.querySelector("[data-gauge]")).toBeNull();
    await act(async () => answer.resolve(server.range("2026-11-16", "2026-11-22")));
    await loaded();
    expect(document.querySelector("[data-gauge]")).toBeNull();
    expect(document.querySelector("[data-week-targets-line]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Set targets" })).not.toBeInTheDocument();
    expect(cell(TODAY, "energy-eaten")).toHaveTextContent(/^119$/);
  });
});

describe("WeekSheet, the week and its buttons", () => {
  it("names the week in its title and steps across months and years with the footer, keeping focus on the button pressed", async () => {
    serveRange(weekServer());
    renderWeek({ shownDate: "2026-12-16" });
    expect(screen.getByRole("dialog", { name: "14 to 20 Dec" })).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next week" });
    next.focus();
    fireEvent.click(next);
    expect(screen.getByRole("dialog", { name: "21 to 27 Dec" })).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByRole("dialog", { name: "28 Dec 2026 to 3 Jan 2027" })).toBeInTheDocument();
    expect(next).toHaveFocus();
    const previous = screen.getByRole("button", { name: "Previous week" });
    previous.focus();
    for (let i = 0; i < 4; i += 1) fireEvent.click(previous);
    expect(screen.getByRole("dialog", { name: "30 Nov to 6 Dec" })).toBeInTheDocument();
    expect(previous).toHaveFocus();
  });

  it("reads the weeks before and after ahead", async () => {
    serveRange(weekServer());
    renderWeek();
    await waitFor(() => expect(getDaySummaries).toHaveBeenCalledTimes(3));
    const asked = jest.mocked(getDaySummaries).mock.calls.map(([from, to]) => `${from}/${to}`);
    expect(asked.sort()).toEqual(["2026-11-09/2026-11-15", "2026-11-16/2026-11-22", "2026-11-23/2026-11-29"]);
  });

  it("gives the day column a fixed width at every size, the same in the week holding today and the week after", async () => {
    serveRange(weekServer());
    renderWeek();
    await loaded();
    const dayCol = () => document.querySelector("[data-week-table] colgroup col")!.getAttribute("class")!.split(/\s+/);
    const withToday = dayCol();
    expect(withToday.filter((c) => /^w-\d+$/.test(c))).toHaveLength(1);
    expect(withToday.filter((c) => /^md:w-\d+$/.test(c))).toHaveLength(1);
    expect(withToday.filter((c) => /(?:^|:)w-(?:auto|full)$/.test(c))).toEqual([]);
    // The figure columns take no width of their own: they share what the day column leaves.
    const figureCols = [...document.querySelectorAll("[data-week-table] colgroup col")].slice(1);
    expect(figureCols.map((c) => c.getAttribute("class"))).toEqual([null, null, null, null]);

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() =>
      expect(document.querySelector("tbody[data-week-row]")).toHaveAttribute("data-week-row", "2026-11-23"),
    );
    await loaded();
    expect(dayCol()).toEqual(withToday);
  });

  it("does not pick a day when a press ends a drag that selected text", async () => {
    serveRange(weekServer());
    const { onPick } = renderWeek();
    await loaded();
    const figure = cell("2026-11-16", "energy-eaten");
    const range = document.createRange();
    range.selectNodeContents(figure);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    // A pointer press: a click's detail counts its presses.
    fireEvent.click(figure, { detail: 1 });
    expect(onPick).not.toHaveBeenCalled();

    window.getSelection()!.removeAllRanges();
    fireEvent.click(figure, { detail: 1 });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith("2026-11-16");
  });

  it("picks a day from the keyboard, and with a pointer on another row, while text outside the row is selected", async () => {
    serveRange(weekServer());
    const { onPick } = renderWeek();
    await loaded();
    // A stray selection: the sheet's title, dragged over.
    const range = document.createRange();
    range.selectNodeContents(screen.getByRole("heading", { name: "16 to 22 Nov" }));
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.isCollapsed).toBe(false);

    // Enter or Space on the row's button: a click with detail 0.
    fireEvent.click(screen.getByRole("button", { name: "Friday 20 November" }), { detail: 0 });
    expect(onPick).toHaveBeenLastCalledWith("2026-11-20");

    fireEvent.click(cell("2026-11-16", "protein-withPlan"), { detail: 1 });
    expect(onPick).toHaveBeenLastCalledWith("2026-11-16");
    expect(onPick).toHaveBeenCalledTimes(2);
    window.getSelection()!.removeAllRanges();
  });

  it("marks the shown day's row and opens with focus on it, and a row press picks that day", async () => {
    serveRange(weekServer());
    const { onPick } = renderWeek({ shownDate: "2026-11-17" });
    const shownButton = screen.getByRole("button", { name: "Tuesday 17 November" });
    expect(shownButton).toHaveAttribute("aria-current", "true");
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
    await waitFor(() => expect(shownButton).toHaveFocus());
    expect(row("2026-11-17").querySelector("[data-shown-bar]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Friday 20 November" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenLastCalledWith("2026-11-20");
    await loaded();
    // A press on a figure, away from the date, picks the row too.
    fireEvent.click(cell("2026-11-16", "protein-withPlan"));
    expect(onPick).toHaveBeenLastCalledWith("2026-11-16");
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});
