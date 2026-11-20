import {
  fakeConnectionsServer,
  testConnection,
  type FakeConnectionsServer,
} from "@/__tests__/helpers/connectionsServer";
import type { AssistantChange, AssistantChangeSummary, AssistantEntryLine, Connection } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSection, rowOf, startConnectedAiTest } from "./connectedAiHarness";

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

// ---------------------------------------------------------------------------
// How the Activity sheet reads: what a screen reader hears for each change,
// where focus starts, how tall the sheet stands with nothing to list, and
// the row's count read again as the sheet opens. The clock is pinned and the
// device is British English (connectedAiHarness), and the account's zone is
// Helsinki, so 12:32 UTC reads "14:32".
// ---------------------------------------------------------------------------

let server: FakeConnectionsServer;

beforeEach(() => {
  startConnectedAiTest();
});

afterEach(() => {
  server.restore();
  jest.restoreAllMocks();
});

const writer = (overrides: Partial<Connection> = {}): Connection =>
  testConnection({ name: "Claude Code, writing", access: "read_write", ...overrides });

let seq = 0;
function change(action: AssistantChange["action"], summary: AssistantChangeSummary): AssistantChange {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    action,
    at: "2026-11-19T12:32:00.000Z",
    connectionName: "Claude Code, writing",
    summary,
    deletionStatus: null,
  };
}

const porridge: AssistantEntryLine = {
  name: "Oat porridge",
  date: "2026-11-21",
  status: "planned",
  kind: "food",
  amount: { grams: 150 },
  figures: { energyKcal: 98, proteinG: 16.5, carbsG: 4, fatG: 0.3 },
};

/**
 * The text a screen reader reaches in `el`, as the accessibility tree has
 * it: every text node outside an `aria-hidden` subtree, in document order,
 * with white space collapsed.
 */
function spokenIn(el: Element): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return;
    if (node.nodeType === Node.TEXT_NODE) out.push(node.textContent ?? "");
    node.childNodes.forEach(walk);
  };
  walk(el);
  return out.join("").replace(/\s+/g, " ").trim();
}

async function openActivity(name: string): Promise<HTMLElement> {
  const row = await waitFor(() => rowOf(name));
  fireEvent.click(within(row).getByRole("button", { name: `Activity of ${name}` }));
  const sheet = await screen.findByRole("dialog", { name: `Changes by ${name}` });
  await waitFor(() => expect(within(sheet).queryByText("Loading the changes…")).not.toBeInTheDocument());
  return sheet;
}

describe("what a screen reader hears", () => {
  it("hears each change as one sentence: what happened, its details with their units, then when", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, [
      change("entry.added", {
        entity: "entry",
        entry: { ...porridge, amount: { portionLabel: "KPL_M", portionUnit: "KPL_M", count: 2, grams: 110 } },
        changes: [],
      }),
      change("saved_meal.changed", {
        entity: "saved_meal",
        name: "Chicken bowl",
        changes: [
          {
            field: "figures",
            from: { energyKcal: 700, proteinG: 35, carbsG: 80, fatG: 25 },
            to: { energyKcal: 650, proteinG: 40, carbsG: 70, fatG: 22.5 },
          },
        ],
      }),
      change("entries.marked", {
        entity: "entries",
        entries: [porridge, { ...porridge, name: "Rahka", date: "2026-11-22" }].map((e) => ({ ...e, status: "eaten" })),
        toDate: null,
      }),
      change("targets.set", {
        entity: "targets",
        effectiveFrom: "2026-12-01",
        before: { energyKcal: { lower: 1900, upper: 2300 }, proteinG: { lower: 130, upper: 170 } },
        after: { energyKcal: { lower: 2000, upper: 2400 }, proteinG: { lower: 140, upper: 180 } },
      }),
      change("favourite.set", { entity: "food", name: "Rahka", changes: [] }),
      change("entry.changed", {
        entity: "entry",
        entry: porridge,
        changes: [{ field: "amount", from: { grams: 150 }, to: { grams: 200 } }],
      }),
    ]);
    renderSection();
    const sheet = await openActivity("Claude Code, writing");

    const rows = [...sheet.querySelectorAll("li[data-change-id]")];
    expect(rows.map(spokenIn)).toEqual([
      "Planned Oat porridge. For 21 November 2026, 2 × Medium piece, 110 g, 98 kcal, 16.5 g protein. 19 November 2026 at 14:32.",
      "Changed the meal Chicken bowl. Figures, before: 700 kcal, 35 g protein, 80 g carbs, 25 g fat. " +
        "Figures, after: 650 kcal, 40 g protein, 70 g carbs, 22.5 g fat. 19 November 2026 at 14:32.",
      "Marked 2 entries eaten. Oat porridge for 21 November 2026, Rahka for 22 November 2026. 19 November 2026 at 14:32.",
      "Set targets from 1 December 2026. Calories 2000 to 2400 kcal, Protein 140 to 180 g. " +
        "Replaced: Calories 1900 to 2300 kcal, Protein 130 to 170 g. 19 November 2026 at 14:32.",
      "Marked Rahka as a favourite. 19 November 2026 at 14:32.",
      "Changed the entry Oat porridge. Amount: 150 g to 200 g. 19 November 2026 at 14:32.",
    ]);
    // The screen keeps its layout: a headline, its lines with a dot between parts, and the time.
    expect(rows[0]!.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "Planned Oat porridgeFor 21 November 2026 · 2 × Medium piece · 110 g · 98 kcal · 16.5 g protein19 November 2026 at 14:32",
    );
  });
});

describe("opening the sheet", () => {
  it("puts focus on its body, so a key pressed at once does not close it", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    renderSection();
    const sheet = await openActivity("Claude Code, writing");
    await waitFor(() => expect(document.activeElement).toBe(sheet.querySelector("[data-prompt-sheet-body]")));
    expect(document.activeElement).not.toBe(within(sheet).getByRole("button", { name: "Close" }));
  });

  it("stands as tall as its content for a connection with none or a few changes, and tall for one with more", async () => {
    const quiet = writer({ name: "Quiet" });
    const few = writer({ name: "Few" });
    const busy = writer({ name: "Busy" });
    server = fakeConnectionsServer({ connections: [quiet, few, busy], availability: { connect: true, write: true } });
    const fav = (name: string) => change("favourite.set", { entity: "food", name, changes: [] });
    server.changes.set(few.id, [fav("A"), fav("B"), fav("C")]);
    server.changes.set(busy.id, [fav("A"), fav("B"), fav("C"), fav("D")]);
    renderSection();

    const close = async (sheet: HTMLElement, name: string): Promise<void> => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: `Changes by ${name}` })).not.toBeInTheDocument());
    };
    const empty = await openActivity("Quiet");
    expect(empty).toHaveTextContent("This connection has not changed anything yet.");
    expect(empty).toHaveAttribute("data-sheet-size", "auto");
    await close(empty, "Quiet");

    const three = await openActivity("Few");
    expect(three.querySelectorAll("li[data-change-id]")).toHaveLength(3);
    expect(three).toHaveAttribute("data-sheet-size", "auto");
    await close(three, "Few");

    expect(await openActivity("Busy")).toHaveAttribute("data-sheet-size", "tall");
  });

  it("reads the list again, so the row's count agrees with the record the sheet shows", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    const fav = (name: string) => change("favourite.set", { entity: "food", name, changes: [] });
    server.changes.set(live.id, [fav("A"), fav("B")]);
    renderSection();
    await waitFor(() => expect(rowOf("Claude Code, writing")).toHaveTextContent("2 changes"));

    // Three changes land while Settings is open, inside the list's fresh time.
    server.changes.set(live.id, [fav("C"), fav("D"), fav("E"), ...server.changes.get(live.id)!]);
    const sheet = await openActivity("Claude Code, writing");
    expect(sheet.querySelectorAll("li[data-change-id]")).toHaveLength(5);
    await waitFor(() => expect(rowOf("Claude Code, writing")).toHaveTextContent("5 changes"));
  });
});
