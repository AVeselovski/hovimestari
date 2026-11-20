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
import { addDays } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import type { DaySummaryList, Entry, Figures, TargetChange } from "@hovimestari/types";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WeekSheet } from "../WeekSheet";
import { FakeDays } from "./harness";
import { estimateEntry, mealEntry } from "./support";

jest.mock("@/lib/api/days", () => ({ getDay: jest.fn(), getDaySummaries: jest.fn() }));

// ---------------------------------------------------------------------------
// The week's average row and the lines under the table, over a fake of
// `GET /days` that answers every day through `summarizeDay` and the average
// through `averageOfDays`, as the server does. The clock is pinned to Friday
// 20 November 2026, the design's worked example: Monday empty, Tuesday to
// Thursday eaten (Wednesday an estimate, Thursday with a plan never marked
// eaten), today eaten and planned, Saturday planned, Sunday empty. Targets
// from 1 November: 1900 to 2200 kcal and 130 to 170 g protein.
// ---------------------------------------------------------------------------

const TODAY = "2026-11-20";
const MONDAY = "2026-11-16";

beforeEach(() => {
  clockFrom(`${TODAY}T10:00:00Z`);
  setTestLocale("en-GB");
  jest.mocked(getDaySummaries).mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  onlineManager.setOnline(true);
});

const TARGETS = (): TargetChange[] => [change("2026-11-01", [1900, 2200], [130, 170])];

/** A whole day's food as one saved meal, so a day's total is the figure the design names. */
function meal(date: string, energyKcal: number, proteinG: number, status: Entry["status"] = "eaten"): Entry {
  const basis: Figures = { energyKcal, proteinG, carbsG: 0, fatG: 0 };
  return mealEntry("Day", 1, basis, { date, status });
}

/** The design's worked example week. */
function workedWeek(): FakeDays {
  const server = new FakeDays([
    meal("2026-11-17", 2050, 142.3),
    estimateEntry("Lounas", { energyKcal: 1980, proteinG: 135.5, carbsG: 0, fatG: 0 }, { date: "2026-11-18" }),
    meal("2026-11-19", 2010, 128.4),
    meal("2026-11-19", 300, 20, "planned"),
    meal(TODAY, 900, 60.2),
    meal(TODAY, 1700, 89.8, "planned"),
    meal("2026-11-21", 2700, 140, "planned"),
  ]);
  server.today = TODAY;
  server.changes = TARGETS();
  return server;
}

function serveRange(server: FakeDays): void {
  jest.mocked(getDaySummaries).mockImplementation(async (from, to) => server.range(from, to));
}

function todayState(today: string | null = TODAY): TodayState {
  return { today, holding: false, confirm: "fresh", unconfirmed: false, retry: () => {} };
}

function renderWeek({
  shownDate = TODAY,
  changes = TARGETS(),
  client = registerTestQueryClient(createTestQueryClient()),
}: { shownDate?: string; changes?: TargetChange[]; client?: QueryClient } = {}): QueryClient {
  client.setQueryData(queryKeys.targets(), overview(changes, TODAY, TODAY));
  render(
    <TodayContext.Provider value={todayState()}>
      <WeekSheet open onClose={() => {}} shownDate={shownDate} onPick={() => {}} />
    </TodayContext.Provider>,
    { wrapper: queryWrapper(client) },
  );
  return client;
}

const loaded = () =>
  waitFor(() => expect(document.querySelector("[data-week-frame]")).not.toHaveAttribute("aria-busy"));

const foot = () => document.querySelector<HTMLElement>("tfoot[data-week-average]")!;
const avg = (key: string) => foot().querySelector<HTMLElement>(`[data-week-average-figure="${key}"]`)!;
const countedLine = () => document.querySelector<HTMLElement>("[data-week-counted-line]")!;
const targetsLine = () => document.querySelector<HTMLElement>("[data-week-targets-line]");
const tokens = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

/** What a cell shows on screen: its text without the screen-reader-only parts. */
function shown(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return copy.textContent ?? "";
}

async function stepTo(direction: "Previous week" | "Next week", monday: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: direction }));
  await waitFor(() => expect(document.querySelector("tbody[data-week-row]")).toHaveAttribute("data-week-row", monday));
  await loaded();
}

describe("WeekSheet, the average row", () => {
  it("shows the worked example's average day under Sunday: Eaten 2013 and 135.4, Planned 2328 and 143.2, each with ≈", async () => {
    serveRange(workedWeek());
    renderWeek();
    await loaded();
    // The row comes after Sunday's, in the table's foot.
    const sunday = document.querySelector('[data-week-row="2026-11-22"]')!;
    expect(sunday.compareDocumentPosition(foot()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(foot()).getByRole("rowheader")).toHaveTextContent(/^Average$/);
    expect(shown(avg("energy-eaten"))).toBe("≈2013");
    expect(shown(avg("energy-withPlan"))).toBe("≈2328");
    expect(shown(avg("protein-eaten"))).toBe("≈135.4");
    expect(shown(avg("protein-withPlan"))).toBe("≈143.2");
    // Semibold as the week's summary, in the day rows' figure type otherwise.
    const dayCell = document.querySelector<HTMLElement>('[data-week-figure="energy-eaten"]')!;
    expect(tokens(avg("energy-eaten"))).toContain("font-semibold");
    expect(tokens(dayCell)).not.toContain("font-semibold");
    expect(
      tokens(avg("energy-eaten"))
        .filter((c) => c !== "font-semibold")
        .sort(),
    ).toEqual(tokens(dayCell).sort());
    // Monday counted as zero (1510), today counted in Eaten (1735), the empty days counted in Planned (1663).
    for (const wrong of ["1510", "1735", "1663"]) expect(foot()).not.toHaveTextContent(wrong);
  });

  it("speaks each average cell alone: estimated, the figure, its count and its position", async () => {
    serveRange(workedWeek());
    renderWeek();
    await loaded();
    expect(avg("energy-eaten")).toHaveTextContent(/^≈estimated 2013, average of 3 days before today, in the range$/);
    expect(avg("protein-eaten")).toHaveTextContent(/^≈estimated 135\.4, average of 3 days before today, in the range$/);
    expect(avg("energy-withPlan")).toHaveTextContent(/^≈estimated 2328, average of 5 days, above the range$/);
    expect(avg("protein-withPlan")).toHaveTextContent(/^≈estimated 143\.2, average of 5 days, in the range$/);
  });

  it("marks each average on the band, the Planned ring under the ticks and the Eaten dot over them", async () => {
    serveRange(workedWeek());
    renderWeek();
    await loaded();
    for (const macro of ["energy", "protein"]) {
      const gauge = foot().querySelector(`[data-gauge="${macro}"]`)!;
      expect(gauge).toHaveAttribute("data-gauge-average", "");
      const parts = [...gauge.querySelectorAll("[data-gauge-part]")].map((p) => p.getAttribute("data-gauge-part"));
      expect(parts).toEqual(["track", "band", "mark-withPlan", "tick-lower", "tick-upper", "mark-eaten"]);
      // The band sits where a day row's band of the same targets sits.
      const band = (root: Element) =>
        root.querySelector<HTMLElement>(`[data-gauge="${macro}"] [data-gauge-part="band"]`)!.style;
      const tuesday = document.querySelector('[data-week-row="2026-11-17"]')!;
      expect([band(foot()).left, band(foot()).width]).toEqual([band(tuesday).left, band(tuesday).width]);
    }
  });

  it("is not a button and adds no stop to the tab order", async () => {
    serveRange(workedWeek());
    renderWeek();
    await loaded();
    expect(foot().querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  });

  it('says "No entries" across the row in a week with no entries, with no gauge and no counted line', async () => {
    const server = workedWeek();
    serveRange(server);
    renderWeek({ shownDate: "2026-12-07" });
    await loaded();
    expect(foot().querySelector("[data-week-average-empty]")).toHaveTextContent(/^No entries$/);
    expect(tokens(foot().querySelector("[data-week-average-empty]"))).toContain("text-ink-muted");
    expect(foot().querySelectorAll("[data-week-average-figure]")).toHaveLength(0);
    expect(foot().querySelector("[data-gauge]")).toBeNull();
    expect(countedLine()).toBeEmptyDOMElement();
    expect(tokens(countedLine())).toContain("invisible");
  });

  it("leaves Eaten's cells empty in a future week, spoken as no days counted, and shows Planned's", async () => {
    const server = workedWeek();
    server.entries.push(meal("2026-11-24", 2100, 150, "planned"), meal("2026-11-26", 1800, 120, "planned"));
    serveRange(server);
    renderWeek({ shownDate: "2026-11-25" });
    await loaded();
    expect(shown(avg("energy-eaten"))).toBe("");
    expect(avg("energy-eaten")).toHaveTextContent(/^no days counted$/);
    expect(shown(avg("energy-withPlan"))).toBe("1950");
    expect(avg("energy-withPlan")).toHaveTextContent(/^1950, average of 2 days, in the range$/);
    // The ring only: Eaten has no position.
    const parts = [...foot().querySelectorAll('[data-gauge="energy"] [data-gauge-part]')].map((p) =>
      p.getAttribute("data-gauge-part"),
    );
    expect(parts).toEqual(["track", "band", "mark-withPlan", "tick-lower", "tick-upper"]);
  });

  it("lays the label out of flow, beside a zero-width spacer, in a header cell styled as a day's", async () => {
    serveRange(workedWeek());
    renderWeek();
    await loaded();
    const label = foot().querySelector("[data-week-average-label]")!;
    expect(tokens(label)).toContain("absolute");
    expect(tokens(label)).toContain("whitespace-nowrap");
    const spacer = foot().querySelector("[data-week-average-spacer]")!;
    expect(tokens(spacer)).toEqual(expect.arrayContaining(["block", "w-0", "min-h-11", "md:min-h-13"]));
    // The spacer gives the row a day's height: the day button's own min-heights.
    const dayButton = document.querySelector('[data-week-row="2026-11-17"] th button')!;
    const minHeights = (el: Element) =>
      tokens(el)
        .filter((c) => /^(md:)?min-h-/.test(c))
        .sort();
    expect(minHeights(spacer)).toEqual(minHeights(dayButton));
    // Nothing else in the header cell is in flow.
    const header = label.parentElement!;
    expect([...header.children]).toEqual([spacer, label]);
    const dayHeader = document.querySelector('[data-week-row="2026-11-17"] th')!;
    expect(tokens(header).sort()).toEqual(tokens(dayHeader).sort());
  });
});

describe("WeekSheet, the counted line", () => {
  it("counts the rows a person sees: 3 eaten days before today and 5 days with entries, never 4 or 7", async () => {
    const server = workedWeek();
    serveRange(server);
    renderWeek();
    await loaded();
    // The rows above Today with eaten entries, and the rows that do not say "No entries".
    const rows = [...document.querySelectorAll<HTMLElement>("tbody[data-week-row]")];
    const dates = rows.map((r) => r.getAttribute("data-week-row")!);
    const eatenBefore = dates.filter((d) => d < TODAY && server.day(d).entryCount - server.day(d).plannedCount > 0);
    const withEntries = rows.filter((r) => r.querySelector("[data-week-empty]") === null);
    expect([eatenBefore.length, withEntries.length]).toEqual([3, 5]);
    expect(countedLine()).toHaveTextContent(/^Eaten: 3 days before today\. Planned: 5 days\.$/);
    expect(countedLine()).not.toHaveTextContent(/4 days|7 days/);
    expect(countedLine()).toHaveAttribute("aria-hidden", "true");
    expect(tokens(countedLine())).not.toContain("invisible");
    // It comes after the table and before the targets line.
    const table = document.querySelector("[data-week-table]")!;
    expect(table.compareDocumentPosition(countedLine()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(countedLine().compareDocumentPosition(targetsLine()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says a past week's counts without 'before today', and a future week's Planned alone", async () => {
    const server = workedWeek();
    for (let i = 0; i < 7; i += 1) server.entries.push(meal(addDays("2026-11-09", i), 2000, 140));
    server.entries.push(meal("2026-11-24", 2100, 150, "planned"), meal("2026-11-26", 1800, 120, "planned"));
    serveRange(server);
    renderWeek();
    await loaded();
    await stepTo("Previous week", "2026-11-09");
    expect(countedLine()).toHaveTextContent(/^Eaten: 7 days\. Planned: 7 days\.$/);
    expect(avg("energy-eaten")).toHaveTextContent(/^2000, average of 7 days, in the range$/);
    await stepTo("Next week", MONDAY);
    await stepTo("Next week", "2026-11-23");
    expect(countedLine()).toHaveTextContent(/^Planned: 2 days\.$/);
  });

  it("says one day and no days in plain words", async () => {
    const server = new FakeDays([
      // Last week: one past day holding only a plan never marked eaten.
      meal("2026-11-10", 2000, 140, "planned"),
      // This week: only today, planned.
      meal(TODAY, 2000, 140, "planned"),
      // Two weeks ago: one eaten day.
      meal("2026-11-04", 2000, 140),
    ]);
    server.today = TODAY;
    server.changes = TARGETS();
    serveRange(server);
    renderWeek();
    await loaded();
    expect(countedLine()).toHaveTextContent(/^Eaten: no days before today\. Planned: 1 day\.$/);
    expect(avg("energy-withPlan")).toHaveTextContent(/^2000, average of 1 day, in the range$/);
    await stepTo("Previous week", "2026-11-09");
    expect(countedLine()).toHaveTextContent(/^Eaten: no days\. Planned: 1 day\.$/);
    await stepTo("Previous week", "2026-11-02");
    expect(countedLine()).toHaveTextContent(/^Eaten: 1 day\. Planned: 1 day\.$/);
  });
});

describe("WeekSheet, when targets start in the week", () => {
  it('says "New targets apply from" when a later change starts mid-week, and the averages then have no gauge', async () => {
    const server = workedWeek();
    server.changes = [...TARGETS(), change("2026-11-19", [2000, 2300], [140, 180])];
    serveRange(server);
    renderWeek({ changes: server.changes });
    await loaded();
    expect(targetsLine()).toHaveTextContent(/^New targets apply from 19 November 2026\.$/);
    expect(screen.queryByText(/^Targets apply from/)).not.toBeInTheDocument();
    // Both averages count days under two targets: figures with no position, and no gauge.
    expect(shown(avg("energy-eaten"))).toBe("≈2013");
    expect(avg("energy-eaten")).toHaveTextContent(/^≈estimated 2013, average of 3 days before today$/);
    expect(foot().querySelector("[data-gauge]")).toBeNull();
    // The week after holds no change: the line keeps its room, empty.
    await stepTo("Next week", "2026-11-23");
    expect(targetsLine()).toBeEmptyDOMElement();
  });

  it("says nothing about a mid-week change equal to the one before it, and the averages keep their gauge", async () => {
    const server = workedWeek();
    server.changes = [...TARGETS(), change("2026-11-19", [1900, 2200], [130, 170])];
    serveRange(server);
    renderWeek({ changes: server.changes });
    await loaded();
    expect(targetsLine()).toBeEmptyDOMElement();
    expect(foot().querySelectorAll("[data-gauge-average]")).toHaveLength(2);
  });

  it("keeps the first change's line when the week holds the first change and a later one", async () => {
    const server = workedWeek();
    server.changes = [change("2026-11-18", [1900, 2200], [130, 170]), change("2026-11-20", [2000, 2300], [140, 180])];
    serveRange(server);
    renderWeek({ changes: server.changes });
    await loaded();
    expect(targetsLine()).toHaveTextContent(/^Targets apply from 18 November 2026\.$/);
    expect(screen.queryByText(/New targets/)).not.toBeInTheDocument();
  });

  it("keeps no frame for the average's gauges while loading a week wholly before the first change", async () => {
    const server = workedWeek();
    server.changes = [change("2026-12-01", [1900, 2200], [130, 170])];
    const answer = deferred<DaySummaryList>();
    jest.mocked(getDaySummaries).mockReturnValueOnce(answer.promise);
    serveRange(server);
    renderWeek({ changes: server.changes });
    expect(foot().querySelector("[data-gauge]")).toBeNull();
    await act(async () => answer.resolve(server.range(MONDAY, "2026-11-22")));
    await loaded();
    expect(foot().querySelector("[data-gauge]")).toBeNull();
  });
});

/**
 * Everything that sets the sheet body's height and the table's place: every row's height classes, the
 * average row's, both lines' presence and boxes. Visible content is left out, since it is meant to change.
 */
function bodyFrame(): unknown {
  const heights = (el: Element | null) =>
    tokens(el)
      .filter((c) =>
        /^(md:)?(min-)?h-|^(md:)?(mt|pt|pb|py)-|^(md:)?leading-|^(md:)?text-(xs|sm|base)$|^(md:|max-md:)?(hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table(-[a-z-]+)?|absolute|relative)$/.test(
          c,
        ),
      )
      .sort();
  const section = (body: Element) => {
    const [figures, gauges] = [...body.querySelectorAll(":scope > tr")];
    return {
      th: heights(body.querySelector("th button, th [data-week-average-spacer]")),
      figures: [...new Set([...figures!.querySelectorAll("td")].map((td) => heights(td).join(" ")))],
      gauges: [...new Set([...gauges!.querySelectorAll("td")].map((td) => heights(td).join(" ")))],
      gaugeCells: gauges!.querySelectorAll("td").length,
    };
  };
  return {
    rows: [...document.querySelectorAll("tbody[data-week-row], tfoot[data-week-average]")].map(section),
    heads: [...document.querySelectorAll("thead th")].map((th) => th.textContent),
    counted: heights(countedLine()),
    targets: heights(targetsLine()),
  };
}

describe("WeekSheet, the average row across states", () => {
  it("keeps the body's frame loading, loaded, failed, offline, in an empty week and in a week with a targets line", async () => {
    const server = workedWeek();
    // A later change in the week after next, so one week shows the targets line.
    server.changes = [...TARGETS(), change("2026-12-02", [2000, 2300], [140, 180])];
    const answer = deferred<DaySummaryList>();
    jest.mocked(getDaySummaries).mockReturnValueOnce(answer.promise);
    serveRange(server);
    renderWeek({ changes: server.changes });

    const states: Record<string, unknown> = {};
    states.loading = bodyFrame();
    expect(foot().querySelectorAll('[data-gauge="frame"]')).toHaveLength(2);
    expect(tokens(countedLine())).toContain("invisible");

    await act(async () => answer.resolve(server.range(MONDAY, "2026-11-22")));
    await loaded();
    expect(countedLine()).not.toBeEmptyDOMElement();
    states.loaded = bodyFrame();

    await stepTo("Next week", "2026-11-23");
    expect(foot().querySelector("[data-week-average-empty]")).not.toBeNull();
    states.empty = bodyFrame();

    await stepTo("Next week", "2026-11-30");
    expect(targetsLine()).toHaveTextContent("New targets apply from 2 December 2026.");
    states.targetsLine = bodyFrame();

    // A failed week and an offline one, each opened fresh, so no week read ahead answers them.
    cleanup();
    jest.mocked(getDaySummaries).mockReset().mockRejectedValue(new Error("boom"));
    renderWeek({ changes: server.changes });
    expect(await screen.findByText("This week did not load.")).toBeInTheDocument();
    states.failed = bodyFrame();

    cleanup();
    serveRange(server);
    onlineManager.setOnline(false);
    renderWeek({ changes: server.changes });
    expect(await screen.findByText("This week needs a connection.")).toBeInTheDocument();
    states.offline = bodyFrame();

    // Between states: each one's frame equals the one before it.
    const names = Object.keys(states);
    for (let i = 1; i < names.length; i += 1) {
      expect({ [names[i]!]: states[names[i]!] }).toEqual({ [names[i]!]: states[names[i - 1]!] });
    }
  });
});
