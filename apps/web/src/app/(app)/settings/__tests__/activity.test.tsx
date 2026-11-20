import {
  fakeConnectionsServer,
  testConnection,
  type FakeConnectionsServer,
} from "@/__tests__/helpers/connectionsServer";
import { openSheet } from "@/__tests__/sheet";
import { api } from "@/lib/api";
import type { AssistantChange, Connection } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSection, rowOf, section, startConnectedAiTest } from "./connectedAiHarness";

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

// ---------------------------------------------------------------------------
// Activity: the change count on a row, the record in its sheet, paging with
// Show more, the empty and failed states, and past connections. The fake
// server pages for real: a cursor names the last change a page showed, and
// one it never issued is refused. The clock is pinned and the device is
// British English (connectedAiHarness), so times read "19 November 2026 at 14:32".
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
/** `count` favourite marks, newest first, one a minute back from 12:32 UTC on 19 November. */
function marks(count: number, prefix = "Food"): AssistantChange[] {
  const start = Date.parse("2026-11-19T12:32:00.000Z");
  return Array.from({ length: count }, (_, i) => {
    seq += 1;
    return {
      id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      action: "favourite.set",
      at: new Date(start - i * 60_000).toISOString(),
      connectionName: "Claude Code, writing",
      summary: { entity: "food", name: `${prefix} ${i + 1}`, changes: [] },
      deletionStatus: null,
    };
  });
}

/** Opens Activity on the named row and returns the sheet once its first page is in. */
async function openActivity(name: string, inRow?: HTMLElement): Promise<HTMLElement> {
  const row = inRow ?? (await waitFor(() => rowOf(name)));
  fireEvent.click(within(row).getByRole("button", { name: `Activity of ${name}` }));
  const sheet = await screen.findByRole("dialog", { name: `Changes by ${name}` });
  await waitFor(() => expect(within(sheet).queryByText("Loading the changes…")).not.toBeInTheDocument());
  return sheet;
}

const rowsIn = (sheet: HTMLElement): HTMLElement[] => [...sheet.querySelectorAll<HTMLElement>("li[data-change-id]")];
const headlines = (sheet: HTMLElement): string[] => rowsIn(sheet).map((li) => li.querySelector("p")?.textContent ?? "");
/** Whether `now` starts with exactly the elements of `before`, the same nodes in the same order. `toEqual` compares DOM nodes by their content, not by identity. */
const keptRows = (now: HTMLElement[], before: HTMLElement[]): boolean => before.every((el, i) => now[i] === el);
const changesReads = (): string[] => server.sent.filter((r) => r.url.endsWith("/changes")).map((r) => r.url);
const cursorsSent = (): (string | undefined)[] =>
  server.sent.filter((r) => r.url.endsWith("/changes")).map((r) => r.params.cursor);
/** The sheet's polite live region: what a screen reader is told as pages land. */
const liveRegion = (sheet: HTMLElement): HTMLElement => {
  const region = [...sheet.querySelectorAll<HTMLElement>('[role="status"]')].find(
    (el) => el.closest("li") === null && el.className.includes("sr-only"),
  );
  if (!region) throw new Error("No live region");
  return region;
};

describe("the change count on a row", () => {
  it("says how many changes a key that can make changes made, and offers Activity", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(12));
    renderSection();
    const row = await waitFor(() => rowOf("Claude Code, writing"));
    expect(row).toHaveTextContent("12 changes");
    expect(within(row).getByRole("button", { name: "Activity of Claude Code, writing" })).toHaveTextContent("Activity");
  });

  it("says one change, and no changes yet, in plain words", async () => {
    const one = writer({ name: "One" });
    const none = writer({ name: "None" });
    server = fakeConnectionsServer({ connections: [one, none], availability: { connect: true, write: true } });
    server.changes.set(one.id, marks(1));
    renderSection();
    await waitFor(() => expect(rowOf("One")).toHaveTextContent("1 change"));
    expect(rowOf("One")).not.toHaveTextContent("1 changes");
    expect(rowOf("None")).toHaveTextContent("No changes yet");
  });

  it("says nothing about changes on a read-only key, which makes none", async () => {
    server = fakeConnectionsServer({ connections: [testConnection({ name: "Reader" })] });
    renderSection();
    const row = await waitFor(() => rowOf("Reader"));
    expect(row).not.toHaveTextContent(/change/i);
    expect(within(row).queryByRole("button", { name: /Activity/ })).not.toBeInTheDocument();
  });
});

describe("the Activity sheet", () => {
  it("opens on the newest 50 changes of that connection, with what each was and when", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(60));
    renderSection();
    const sheet = await openActivity("Claude Code, writing");
    expect(sheet).toHaveTextContent("Everything this connection changed, newest first.");
    expect(rowsIn(sheet)).toHaveLength(50);
    expect(headlines(sheet)[0]).toBe("Marked Food 1 as a favourite");
    expect(rowsIn(sheet)[0]).toHaveTextContent("19 November 2026 at 14:32");
    expect(within(sheet).getByRole("button", { name: "Show more" })).toBeInTheDocument();
    // Nothing on a change offers to undo it or to act on it.
    expect(within(sheet).queryByRole("link")).not.toBeInTheDocument();
    expect(within(sheet).getAllByRole("button")).toEqual([
      within(sheet).getByRole("button", { name: "Show more" }),
      within(sheet).getByRole("button", { name: "Close" }),
    ]);
  });

  it("appends each page below the rows on screen, which stay the same rows in the same order", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(120));
    renderSection();
    const sheet = await openActivity("Claude Code, writing");
    const first = rowsIn(sheet);

    const more = within(sheet).getByRole("button", { name: "Show more" });
    act(() => more.focus());
    expect(liveRegion(sheet)).toHaveTextContent("");
    fireEvent.click(more);
    await waitFor(() => expect(rowsIn(sheet)).toHaveLength(100));
    // The 50 rows shown before are the same elements, at the same places, and the page is under them.
    expect(keptRows(rowsIn(sheet), first)).toBe(true);
    expect(headlines(sheet)[50]).toBe("Marked Food 51 as a favourite");
    // Focus goes to the first row the page added, and the live region says how many came.
    expect(document.activeElement).toBe(rowsIn(sheet)[50]);
    expect(liveRegion(sheet)).toHaveTextContent(/^50 more changes shown$/);
    const said = liveRegion(sheet).firstElementChild;

    const second = rowsIn(sheet);
    fireEvent.click(within(sheet).getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(rowsIn(sheet)).toHaveLength(120));
    expect(keptRows(rowsIn(sheet), second)).toBe(true);
    // The last page is in: Show more goes, focus goes to the first row it added, and the region says it once, anew.
    expect(within(sheet).queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(rowsIn(sheet)[100]);
    expect(liveRegion(sheet)).toHaveTextContent(/^20 more changes shown$/);
    expect(liveRegion(sheet).firstElementChild).not.toBe(said);
    expect(new Set(headlines(sheet)).size).toBe(120);
  });

  describe("scrolling to the first new row", () => {
    // jsdom lays nothing out, so every box is zero. These give the sheet's
    // body and each row's headline the boxes a browser would: the body shows
    // 0 to 600, the first page ends at 560, and the new page's first headline
    // sits where Show more was, or below the fold. Every other box is real.
    // jsdom has no DOMRect, so a box is a plain object of the same shape.
    const box = (top: number, height: number): DOMRect => {
      const rect = { x: 0, y: top, left: 0, top, width: 400, height, right: 400, bottom: top + height };
      return { ...rect, toJSON: () => rect };
    };

    function layOut(newHeadlineTop: number): void {
      const real = Element.prototype.getBoundingClientRect;
      jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        if (this.matches("[data-sheet-body]")) return box(0, 600);
        const row = this.closest("li[data-change-id]");
        if (row && this === row.querySelector("p")) {
          const index = [...row.parentElement!.children].indexOf(row);
          const top = index < 50 ? 560 - (50 - index) * 100 : newHeadlineTop + (index - 50) * 100;
          return box(top, 24);
        }
        return real.call(this);
      });
    }

    async function showMore(): Promise<{ sheet: HTMLElement; scrolled: Element[] }> {
      const live = writer();
      server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
      server.changes.set(live.id, marks(60));
      renderSection();
      const sheet = await openActivity("Claude Code, writing");
      const scrolled: Element[] = [];
      jest.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, arg) {
        expect(arg).toEqual({ block: "nearest" });
        scrolled.push(this);
      });
      fireEvent.click(within(sheet).getByRole("button", { name: "Show more" }));
      await waitFor(() => expect(rowsIn(sheet)).toHaveLength(60));
      expect(document.activeElement).toBe(rowsIn(sheet)[50]);
      return { sheet, scrolled };
    }

    it("scrolls nothing when the new row's headline is already in view", async () => {
      layOut(570);
      const { scrolled } = await showMore();
      expect(scrolled).toEqual([]);
    });

    it("scrolls the new row into view, once, when its headline is below the fold", async () => {
      layOut(590);
      const { sheet, scrolled } = await showMore();
      expect(scrolled).toEqual([rowsIn(sheet)[50]]);
    });
  });

  it("neither repeats nor reorders a row when changes land while it is open", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(70));
    renderSection();
    const sheet = await openActivity("Claude Code, writing");
    const before = headlines(sheet);

    // Three new changes land at the top of the record while the sheet is open.
    server.changes.set(live.id, [...marks(3, "New"), ...server.changes.get(live.id)!]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(rowsIn(sheet)).toHaveLength(70));

    expect(headlines(sheet).slice(0, 50)).toEqual(before);
    expect(headlines(sheet)[50]).toBe("Marked Food 51 as a favourite");
    expect(headlines(sheet).some((h) => h.includes("New"))).toBe(false);
    expect(new Set(headlines(sheet)).size).toBe(70);
  });

  it("says when the connection has not changed anything", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    renderSection();
    const sheet = await openActivity("Claude Code, writing");
    expect(sheet).toHaveTextContent("This connection has not changed anything yet.");
    expect(rowsIn(sheet)).toHaveLength(0);
    expect(within(sheet).queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("says it could not load the changes, and Try again reads them", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(3));
    server.changesRefusal = { status: 500 };
    renderSection();
    fireEvent.click(await within(section()).findByRole("button", { name: "Activity of Claude Code, writing" }));
    const sheet = await screen.findByRole("dialog", { name: "Changes by Claude Code, writing" });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Could not load the changes.");

    server.changesRefusal = null;
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rowsIn(sheet)).toHaveLength(3));
    expect(within(sheet).queryByText("Could not load the changes.")).not.toBeInTheDocument();
  });

  it("puts focus on the sheet's body when Try again finds the record empty, since no row is there to take it", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changesRefusal = { status: 500 };
    renderSection();
    fireEvent.click(await within(section()).findByRole("button", { name: "Activity of Claude Code, writing" }));
    const sheet = await screen.findByRole("dialog", { name: "Changes by Claude Code, writing" });
    await within(sheet).findByRole("alert");

    server.changesRefusal = null;
    const again = within(sheet).getByRole("button", { name: "Try again" });
    act(() => again.focus());
    fireEvent.click(again);
    await within(sheet).findByText("This connection has not changed anything yet.");
    // Try again is gone with the failed line. Focus is where the sheet put it on open, not on the page.
    await waitFor(() => expect(document.activeElement).toBe(sheet.querySelector("[data-prompt-sheet-body]")));
  });

  it("keeps every page shown when the next one fails, and Try again appends it", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(80));
    renderSection();
    const sheet = await openActivity("Claude Code, writing");
    const first = rowsIn(sheet);

    server.changesRefusal = { status: 503 };
    const more = within(sheet).getByRole("button", { name: "Show more" });
    act(() => more.focus());
    fireEvent.click(more);
    await within(sheet).findByText("Could not load more.", { selector: "p" });
    expect(keptRows(rowsIn(sheet), first)).toBe(true);
    const again = within(sheet).getByRole("button", { name: "Try again" });
    // The button keeps focus, and the live region says the page did not come.
    expect(document.activeElement).toBe(again);
    expect(liveRegion(sheet)).toHaveTextContent(/^Could not load more\.$/);

    server.changesRefusal = null;
    fireEvent.click(again);
    await waitFor(() => expect(rowsIn(sheet)).toHaveLength(80));
    expect(keptRows(rowsIn(sheet), first)).toBe(true);
    expect(within(sheet).queryByText("Could not load more.", { selector: "p" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(rowsIn(sheet)[50]);
    expect(liveRegion(sheet)).toHaveTextContent(/^30 more changes shown$/);
    // The retry asked for the page after the same cursor as the failed read, the one the first page gave.
    const [firstRead, failed, retried] = cursorsSent();
    expect(firstRead).toBeUndefined();
    expect(failed).toEqual(expect.any(String));
    expect(retried).toBe(failed);
    expect(cursorsSent()).toHaveLength(3);
  });

  it("reads the record fresh on every open", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(2));
    renderSection();
    let sheet = await openActivity("Claude Code, writing");
    expect(rowsIn(sheet)).toHaveLength(2);
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(openSheet("Changes by Claude Code, writing")).toBeNull());

    server.changes.set(live.id, [...marks(1, "Later"), ...server.changes.get(live.id)!]);
    sheet = await openActivity("Claude Code, writing");
    await waitFor(() => expect(rowsIn(sheet)).toHaveLength(3));
    expect(headlines(sheet)[0]).toBe("Marked Later 1 as a favourite");
  });
});

describe("past connections", () => {
  it("lists a revoked key that made changes under its own heading, readable, with nothing to revoke", async () => {
    server = fakeConnectionsServer({ availability: { connect: true, write: true } });
    const pastId = "11111111-1111-4111-8111-111111111111";
    server.past = [{ id: pastId, name: "Old laptop", changeCount: 2, lastChangeAt: "2026-11-18T09:15:00.000Z" }];
    server.changes.set(pastId, marks(2, "Old"));
    renderSection();

    const heading = await within(section()).findByRole("heading", { name: "Past connections", level: 3 });
    const past = heading.closest("section")!;
    const row = within(past).getByRole("heading", { name: "Old laptop", level: 4 }).closest("li")!;
    expect(row).toHaveTextContent("2 changes");
    expect(row).toHaveTextContent("Last change 18 November 2026");
    expect(
      within(row)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Activity"]);

    const sheet = await openActivity("Old laptop", row);
    expect(headlines(sheet)).toEqual(["Marked Old 1 as a favourite", "Marked Old 2 as a favourite"]);
    expect(changesReads()).toEqual([`/connections/${pastId}/changes`]);
  });

  it("shows no heading while no revoked key made changes", async () => {
    server = fakeConnectionsServer({ connections: [writer()], availability: { connect: true, write: true } });
    renderSection();
    await waitFor(() => rowOf("Claude Code, writing"));
    expect(within(section()).queryByRole("heading", { name: "Past connections" })).not.toBeInTheDocument();
  });

  it("moves a revoked key that made changes into past connections", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live], availability: { connect: true, write: true } });
    server.changes.set(live.id, marks(4));
    renderSection();
    const row = await waitFor(() => rowOf("Claude Code, writing"));
    fireEvent.click(within(row).getByRole("button", { name: "Revoke Claude Code, writing" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke Claude Code, writing?" });
    await waitFor(() => expect(dialog.querySelector("[data-armed]")).not.toBeNull());
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));

    const heading = await within(section()).findByRole("heading", { name: "Past connections", level: 3 });
    const past = heading.closest("section")!;
    expect(
      within(past).getByRole("heading", { name: "Claude Code, writing", level: 4 }).closest("li"),
    ).toHaveTextContent("4 changes");
  });
});

describe("the fake server", () => {
  it("refuses a cursor it never issued, as the route does", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live] });
    await expect(api.get(`/connections/${live.id}/changes`, { params: { cursor: "made-up" } })).rejects.toMatchObject({
      response: { status: 400, data: { code: "invalid_request" } },
    });
  });

  it("refuses a cursor whose change has left the record, as the route does, rather than starting again", async () => {
    const live = writer();
    server = fakeConnectionsServer({ connections: [live] });
    server.pageSize = 2;
    server.changes.set(live.id, marks(5));
    const page = await api.get<{ nextCursor: string }>(`/connections/${live.id}/changes`);
    server.changes.set(live.id, server.changes.get(live.id)!.slice(2));
    await expect(
      api.get(`/connections/${live.id}/changes`, { params: { cursor: page.data.nextCursor } }),
    ).rejects.toMatchObject({ response: { status: 400, data: { code: "invalid_request" } } });
  });
});
