import { fakeAuth } from "@/__tests__/helpers/auth";
import {
  fakeConnectionsServer,
  testConnection,
  type FakeConnectionsServer,
} from "@/__tests__/helpers/connectionsServer";
import { confirmArmed, openSheet } from "@/__tests__/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSection, rowOf, section, startConnectedAiTest } from "./connectedAiHarness";

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

// The Connected AI section in Settings: its rows and lines in each state, and
// revoking. The create sheet is in connectionCreate.test.tsx, the key reveal
// in connectionReveal.test.tsx.

let server: FakeConnectionsServer;

beforeEach(() => {
  startConnectedAiTest();
});

afterEach(() => {
  server.restore();
  jest.restoreAllMocks();
});

describe("the Connected AI section", () => {
  it("says what it is, then that nothing is connected, with both buttons", async () => {
    server = fakeConnectionsServer();
    renderSection();
    expect(section()).toHaveTextContent(
      "Connect an AI assistant you already use, such as Claude. It reads the same figures you see here.",
    );
    // While no key can make changes, the intro promises none.
    await within(section()).findByText("No assistant is connected yet.");
    expect(section()).not.toHaveTextContent("A key that can make changes");
    expect(await within(section()).findByText("No assistant is connected yet.")).toBeInTheDocument();
    expect(within(section()).getByRole("button", { name: "Connect an assistant" })).toBeInTheDocument();
    expect(within(section()).getByRole("button", { name: "How to connect" })).toBeInTheDocument();
  });

  it("says what a key that can make changes does only while the server makes one", async () => {
    server = fakeConnectionsServer({ availability: { connect: true, write: true } });
    renderSection();
    await within(section()).findByText("No assistant is connected yet.");
    expect(section()).toHaveTextContent(
      "It reads the same figures you see here. A key that can make changes also lets it log and plan for you.",
    );
  });

  it("keeps one line's room and no buttons while the list loads", () => {
    server = fakeConnectionsServer();
    renderSection();
    expect(within(section()).queryByRole("button")).not.toBeInTheDocument();
    expect(within(section()).queryByText("No assistant is connected yet.")).not.toBeInTheDocument();
  });

  it("says the list shows once the server is in reach when it cannot be read, and reads it again on Try again", async () => {
    server = fakeConnectionsServer({ connections: [testConnection({ name: "Reader" })] });
    server.listRefusal = { status: 500 };
    renderSection();
    expect(
      await within(section()).findByText("Your connections show here once Hovimestari can reach the server."),
    ).toBeInTheDocument();
    const retry = within(section()).getByRole("button", { name: "Try again" });
    expect(within(section()).queryByRole("button", { name: "Connect an assistant" })).not.toBeInTheDocument();
    expect(within(section()).queryByRole("button", { name: "How to connect" })).not.toBeInTheDocument();

    server.listRefusal = null;
    const before = server.sent.length;
    fireEvent.click(retry);
    expect(await within(section()).findByRole("heading", { name: "Reader" })).toBeInTheDocument();
    expect(server.sent.slice(before).map((r) => r.method)).toEqual(["GET"]);
    expect(within(section()).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps Try again where it is while it asks again, and asks once for two presses", async () => {
    server = fakeConnectionsServer();
    server.listRefusal = { status: 500 };
    renderSection();
    const retry = await within(section()).findByRole("button", { name: "Try again" });
    let release = (): void => {};
    server.listGate = new Promise((resolve) => {
      release = resolve;
    });
    const before = server.sent.length;
    fireEvent.click(retry);
    await waitFor(() => expect(retry).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(retry);
    expect(within(section()).getByRole("button", { name: "Try again" })).toBe(retry);
    expect(section()).toHaveTextContent("Your connections show here once Hovimestari can reach the server.");
    server.listRefusal = null;
    await act(async () => release());
    expect(await within(section()).findByText("No assistant is connected yet.")).toBeInTheDocument();
    expect(server.sent.slice(before).filter((r) => r.method === "GET")).toHaveLength(1);
  });

  it("does not read the list while the server is out of reach", () => {
    server = fakeConnectionsServer();
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline"));
    renderSection();
    expect(server.sent).toEqual([]);
    expect(section()).toHaveTextContent("Your connections show here once Hovimestari can reach the server.");
    expect(within(section()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows each row's name, access, expiry and last use", async () => {
    server = fakeConnectionsServer({
      connections: [
        testConnection({ name: "Claude Code on my laptop", lastUsedAt: "2026-11-18T09:00:00.000Z" }),
        testConnection({ name: "Claude Desktop" }),
        testConnection({
          name: "Old laptop",
          status: "expired",
          expiresAt: "2026-11-01T08:00:00.000Z",
        }),
      ],
    });
    renderSection();
    await within(section()).findByRole("heading", { name: "Claude Code on my laptop" });

    const used = rowOf("Claude Code on my laptop");
    expect(used).toHaveTextContent("Read only");
    expect(used).toHaveTextContent("Expires 19 December 2026");
    expect(used).toHaveTextContent("Last used 18 November 2026");
    expect(within(used).getByRole("button", { name: "Revoke Claude Code on my laptop" })).toHaveTextContent("Revoke");

    expect(rowOf("Claude Desktop")).toHaveTextContent("Not used yet");

    const expired = rowOf("Old laptop");
    // Said once, on the date line.
    expect(expired.textContent?.match(/Expired/g)).toHaveLength(1);
    expect(expired).toHaveTextContent("Expired 1 November 2026");
    expect(within(expired).getByRole("button", { name: "Remove Old laptop" })).toHaveTextContent("Remove");
  });

  it("reads a moment as the day in the account's zone", async () => {
    // 22.30 UTC on 18 November is already 19 November in Helsinki.
    server = fakeConnectionsServer({ connections: [testConnection({ lastUsedAt: "2026-11-18T22:30:00.000Z" })] });
    renderSection();
    await within(section()).findByRole("heading", { name: "Claude on my laptop" });
    expect(rowOf("Claude on my laptop")).toHaveTextContent("Last used 19 November 2026");
  });

  it("says a read-and-write key can only read while changes are off, and keeps its tag", async () => {
    server = fakeConnectionsServer({
      connections: [testConnection({ name: "Writer", access: "read_write" }), testConnection({ name: "Reader" })],
      availability: { connect: true, write: false },
    });
    const { unmount } = renderSection();
    await within(section()).findByRole("heading", { name: "Writer" });
    expect(rowOf("Writer")).toHaveTextContent("Read and write");
    expect(rowOf("Writer")).toHaveTextContent("Changes are switched off for now. It can only read.");
    expect(rowOf("Reader")).not.toHaveTextContent("Changes are switched off");
    unmount();

    server.availability = { connect: true, write: true };
    renderSection();
    await within(section()).findByRole("heading", { name: "Writer" });
    expect(rowOf("Writer")).not.toHaveTextContent("Changes are switched off");
  });

  it("while connecting is off, says no key works, offers neither way to connect, and keeps each Revoke", async () => {
    server = fakeConnectionsServer({
      connections: [testConnection({ name: "Reader" })],
      availability: { connect: false, write: false },
    });
    renderSection();
    const line = await within(section()).findByText(
      "Connecting an assistant is switched off for now. No assistant can reach Hovimestari, and your keys do not work until it is back on.",
    );
    // Read before the rows, so no row reads as working.
    expect(line.compareDocumentPosition(rowOf("Reader")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section()).queryByRole("button", { name: "Connect an assistant" })).not.toBeInTheDocument();
    expect(within(section()).queryByRole("button", { name: "How to connect" })).not.toBeInTheDocument();
    expect(within(rowOf("Reader")).getByRole("button", { name: "Revoke Reader" })).toBeInTheDocument();
  });

  it("at ten keys that still work, says so in place of Connect an assistant, counting no expired key", async () => {
    const live = Array.from({ length: 10 }, (_, i) => testConnection({ name: `Key ${i + 1}` }));
    const old = testConnection({ name: "Old", status: "expired", expiresAt: "2026-11-01T08:00:00.000Z" });
    server = fakeConnectionsServer({ connections: [...live, old] });
    renderSection();
    expect(
      await within(section()).findByText(
        "You have 10 keys that still work, the most at one time. Revoke one to connect another assistant.",
      ),
    ).toBeInTheDocument();
    expect(within(section()).getAllByRole("listitem")).toHaveLength(11);
    expect(within(section()).queryByRole("button", { name: "Connect an assistant" })).not.toBeInTheDocument();
    expect(within(section()).getByRole("button", { name: "How to connect" })).toBeInTheDocument();
  });

  it("offers Connect an assistant again below ten keys that still work, however many expired ones are listed", async () => {
    const live = Array.from({ length: 9 }, (_, i) => testConnection({ name: `Key ${i + 1}` }));
    const old = [1, 2].map((i) =>
      testConnection({ name: `Old ${i}`, status: "expired", expiresAt: "2026-11-01T08:00:00.000Z" }),
    );
    server = fakeConnectionsServer({ connections: [...live, ...old] });
    renderSection();
    expect(await within(section()).findByRole("button", { name: "Connect an assistant" })).toBeInTheDocument();
    expect(section()).not.toHaveTextContent("the most at one time");
  });

  it("opens the setup steps in place with YOUR_KEY, and says what to do about a lost key", async () => {
    server = fakeConnectionsServer();
    renderSection();
    const howTo = await within(section()).findByRole("button", { name: "How to connect" });
    expect(howTo).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(howTo);
    expect(howTo).toHaveAttribute("aria-expanded", "true");
    expect(section()).toHaveTextContent("Run this in a terminal.");
    expect(section().querySelector("[data-snippet]")).toHaveTextContent(
      'claude mcp add --transport http hovimestari http://localhost:3001/mcp --header "Authorization: Bearer YOUR_KEY"',
    );
    expect(section()).toHaveTextContent(
      "Lost a key? A key is shown only once. Revoke its connection and connect again for a new one.",
    );

    fireEvent.click(within(section()).getByRole("radio", { name: "Claude Desktop" }));
    expect(section()).toHaveTextContent("It needs Node.js on your computer.");
    expect(section().querySelector("[data-snippet]")?.textContent).toContain('"AUTH_HEADER": "Bearer YOUR_KEY"');
  });

  it("moves between the two assistants with the arrow keys, one Tab stop", async () => {
    server = fakeConnectionsServer();
    renderSection();
    fireEvent.click(await within(section()).findByRole("button", { name: "How to connect" }));
    const code = within(section()).getByRole("radio", { name: "Claude Code" });
    const desktop = within(section()).getByRole("radio", { name: "Claude Desktop" });
    expect(code).toHaveAttribute("tabindex", "0");
    expect(desktop).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(code, { key: "ArrowRight" });
    expect(desktop).toHaveAttribute("aria-checked", "true");
    expect(desktop).toHaveFocus();
  });
});

describe("revoking", () => {
  it("asks first, takes the row off and moves focus to the next row's Revoke", async () => {
    server = fakeConnectionsServer({
      connections: [testConnection({ name: "First", access: "read_write" }), testConnection({ name: "Second" })],
    });
    renderSection();
    await within(section()).findByRole("heading", { name: "First" });
    fireEvent.click(within(rowOf("First")).getByRole("button", { name: "Revoke First" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke First?" });
    expect(dialog).toHaveTextContent("The assistant loses access right away. You can connect it again with a new key.");
    expect(dialog).toHaveTextContent("What it changed stays, and so does its record.");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(within(section()).queryByRole("heading", { name: "First" })).not.toBeInTheDocument());
    expect(server.connections.map((c) => c.name)).toEqual(["Second"]);
    await waitFor(() => expect(within(rowOf("Second")).getByRole("button", { name: "Revoke Second" })).toHaveFocus());
  });

  it("leaves out the note on changes for a read-only key", async () => {
    server = fakeConnectionsServer({ connections: [testConnection({ name: "Reader" })] });
    renderSection();
    fireEvent.click(await within(section()).findByRole("button", { name: "Revoke Reader" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke Reader?" });
    expect(dialog).not.toHaveTextContent("What it changed stays");
  });

  it("moves focus to Connect an assistant after the last row goes", async () => {
    server = fakeConnectionsServer({ connections: [testConnection({ name: "Only" })] });
    renderSection();
    const button = await within(section()).findByRole("button", { name: "Revoke Only" });
    const panel = section();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Revoke Only?" });
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(panel).toHaveTextContent("No assistant is connected yet."));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Connect an assistant" })).toHaveFocus());
  });

  it("removes an expired key after its own question", async () => {
    server = fakeConnectionsServer({
      connections: [testConnection({ name: "Old", status: "expired", expiresAt: "2026-11-01T08:00:00.000Z" })],
    });
    renderSection();
    const button = await within(section()).findByRole("button", { name: "Remove Old" });
    const panel = section();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Remove Old?" });
    expect(dialog).toHaveTextContent("This key has expired and no longer works. Removing it takes it off this list.");
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(panel).toHaveTextContent("No assistant is connected yet."));
    expect(server.connections).toEqual([]);
  });

  it("treats a key already revoked elsewhere as done", async () => {
    const gone = testConnection({ name: "Twice" });
    server = fakeConnectionsServer({ connections: [gone] });
    renderSection();
    const button = await within(section()).findByRole("button", { name: "Revoke Twice" });
    const panel = section();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Revoke Twice?" });
    // Another device revoked it meanwhile: the server answers 404.
    server.connections = [];
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(panel).toHaveTextContent("No assistant is connected yet."));
    await waitFor(() => expect(openSheet("Revoke Twice?")).toBeNull());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the question open with its line when the revoke fails", async () => {
    server = fakeConnectionsServer({ connections: [testConnection({ name: "Stays" })] });
    server.refuseRevoke = () => ({ status: 500 });
    renderSection();
    fireEvent.click(await within(section()).findByRole("button", { name: "Revoke Stays" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke Stays?" });
    await confirmArmed();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not revoke the connection.");
    expect(server.connections).toHaveLength(1);
  });
});
