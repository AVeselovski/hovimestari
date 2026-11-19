import {
  fakeConnectionsServer,
  testConnection,
  type FakeConnectionsServer,
} from "@/__tests__/helpers/connectionsServer";
import { confirmArmed, openSheet } from "@/__tests__/sheet";
import { injectAuthHandlers } from "@/lib/api";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  fillCreate,
  makeKey,
  openCreate,
  renderSection,
  rowOf,
  section,
  startConnectedAiTest,
} from "./connectedAiHarness";

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

// Connect an assistant: the create sheet, its refusals, and the new key's
// row and Copy buttons. What must hold for the key itself across states is
// in connectionReveal.test.tsx.

let server: FakeConnectionsServer;

beforeEach(() => {
  startConnectedAiTest();
});

afterEach(() => {
  server.restore();
  jest.restoreAllMocks();
});

describe("the create sheet", () => {
  it("while writing is off, shows Read only as a line with no choice, and makes a read key", async () => {
    server = fakeConnectionsServer({ availability: { connect: true, write: false } });
    renderSection();
    const dialog = await openCreate();

    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    const line = dialog.querySelector("[data-read-only-access]");
    expect(line).toHaveTextContent(
      "Read only. The assistant can see your targets, days, foods and saved meals. It cannot change anything.",
    );
    // The read-only consent.
    expect(dialog).toHaveTextContent(
      "Anyone who has the key can read all of this until the key expires or you revoke it.",
    );
    expect(dialog).toHaveTextContent("Barcodes it looks up count toward the same hourly limit as your own scans.");
    expect(within(dialog).getByRole("checkbox", { name: "I understand and I want to connect." })).not.toBeChecked();

    const create = within(dialog).getByRole("button", { name: "Create key" });
    expect(create).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Claude Code on my laptop" } });
    expect(create).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(create).toBeEnabled();
    fireEvent.click(create);

    await waitFor(() => expect(server.issuedKeys).toHaveLength(1));
    const post = server.sent.find((r) => r.method === "POST");
    expect(post?.body).toEqual({ name: "Claude Code on my laptop", access: "read", expiresInDays: 30 });
  });

  it("offers the lifetimes in a native select, 30 days chosen", async () => {
    server = fakeConnectionsServer();
    renderSection();
    const dialog = await openCreate();
    const select = within(dialog).getByLabelText("Key expires after");
    expect(select.tagName).toBe("SELECT");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["7 days", "30 days", "90 days", "1 year"]);
    expect(select).toHaveValue("30");
  });

  it("while writing is on, offers both, turns a chosen year into 90 days, and holds the tick for one access", async () => {
    server = fakeConnectionsServer({ availability: { connect: true, write: true } });
    renderSection();
    const dialog = await openCreate();

    const read = within(dialog).getByRole("radio", { name: /^Read only/ });
    const write = within(dialog).getByRole("radio", { name: /^Read and write/ });
    expect(read).toBeChecked();
    expect(dialog).toHaveTextContent("It cannot delete your foods or saved meals.");
    // No promise of an approval the app does not have yet.
    expect(dialog).not.toHaveTextContent("asks you first");
    expect(dialog).not.toHaveTextContent("Recipes tab");

    const select = within(dialog).getByLabelText("Key expires after");
    fireEvent.change(select, { target: { value: "365" } });
    fillCreate(dialog, "Claude, writing");
    expect(within(dialog).getByRole("checkbox")).toBeChecked();

    fireEvent.click(write);
    expect(
      within(dialog).getByRole("checkbox", { name: "I understand it can change my data, and I want to connect." }),
    ).not.toBeChecked();
    expect(select).toHaveValue("90");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["7 days", "30 days", "90 days"]);
    expect(dialog).toHaveTextContent("A key that can make changes lasts at most 90 days.");
    expect(dialog).toHaveTextContent("Hovimestari tells your assistant to ask you before each change.");
    expect(within(dialog).getByRole("button", { name: "Create key" })).toBeDisabled();
    // Back to Read only: the box shows the tick it was given for that access.
    fireEvent.click(read);
    expect(within(dialog).getByRole("checkbox")).toBeChecked();
    fireEvent.click(write);

    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(server.issuedKeys).toHaveLength(1));
    expect(server.sent.find((r) => r.method === "POST")?.body).toEqual({
      name: "Claude, writing",
      access: "read_write",
      expiresInDays: 90,
    });
  });

  it("shows the limit above the buttons when another device took the tenth key meanwhile, and makes nothing", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => testConnection({ name: `Key ${i + 1}` }));
    server = fakeConnectionsServer({ connections: nine });
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "One more");
    server.connections.unshift(testConnection({ name: "Made elsewhere" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You already have 10 keys that still work. Revoke one first.",
    );
    expect(server.issuedKeys).toEqual([]);
    expect(openSheet("Your key")).toBeNull();
    // The list is read again, and the section now says it is at the limit.
    expect(
      await within(section()).findByText(
        "You have 10 keys that still work, the most at one time. Revoke one to connect another assistant.",
      ),
    ).toBeInTheDocument();
  });

  it("puts a refused name under the Name field", async () => {
    server = fakeConnectionsServer();
    server.refuseCreate = () => ({ status: 400, code: "connection_name_invalid" });
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Laptop");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    const name = within(dialog).getByLabelText("Name");
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(document.getElementById(name.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Use only characters that show on screen.",
    );
    expect(name).toHaveFocus();
  });

  it("refuses a name of only blank characters before it asks the server", async () => {
    server = fakeConnectionsServer();
    renderSection();
    const dialog = await openCreate();
    // A Hangul filler: not blank to `trim`, and nothing that shows.
    fillCreate(dialog, "ㅤ");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true"));
    expect(server.sent.filter((r) => r.method === "POST")).toEqual([]);
  });

  it("says when changes were switched off meanwhile, and reads what the server offers again", async () => {
    server = fakeConnectionsServer({ availability: { connect: true, write: true } });
    renderSection();
    const dialog = await openCreate();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Read and write/ }));
    fillCreate(dialog, "Writer");
    server.availability = { connect: true, write: false };
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Changes by an assistant are switched off for now.",
    );
    // The list was read again, and the form now offers read only.
    await waitFor(() => expect(dialog.querySelector("[data-read-only-access]")).not.toBeNull());
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    // The tick was for a writing key: it does not carry over to a read key.
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
  });

  it("says the server switched connecting off, and reads the list again so the section says so too", async () => {
    server = fakeConnectionsServer();
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Laptop");
    server.availability = { connect: false, write: false };
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Connecting an assistant is switched off for now.",
    );
    expect(
      await within(section()).findByText(/^Connecting an assistant is switched off for now\. No assistant can reach/),
    ).toBeInTheDocument();
    expect(
      within(section()).queryByRole("button", { name: "Connect an assistant", hidden: true }),
    ).not.toBeInTheDocument();
    expect(within(section()).queryByRole("button", { name: "How to connect", hidden: true })).not.toBeInTheDocument();
  });

  it("after a create whose answer never came, reads the list again, so a key the server made shows as a row to revoke", async () => {
    server = fakeConnectionsServer();
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Lost on the way");
    server.loseCreateAnswer = true;
    const before = server.sent.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(openSheet("Your key")).toBeNull();
    expect(server.issuedKeys).toHaveLength(1);
    // The row is there, behind the sheet, with its Revoke.
    const row = await within(section()).findByRole("heading", { name: "Lost on the way", hidden: true });
    expect(
      within(row.closest("li")!).getByRole("button", { name: "Revoke Lost on the way", hidden: true }),
    ).toBeInTheDocument();
    expect(row.closest("li")).toHaveTextContent("Not used yet");
    expect(server.sent.slice(before).map((r) => r.method)).toEqual(["POST", "GET"]);
  });

  it("says it could not create the key on an answer with no code", async () => {
    server = fakeConnectionsServer();
    server.refuseCreate = () => ({ status: 500 });
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Laptop");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not create the key.");
  });

  it("renews an ended session once and makes the key on the retry (401 session_expired)", async () => {
    let token = "stale";
    const renewSession = jest.fn(async () => {
      token = "fresh";
      return true;
    });
    injectAuthHandlers({ getAccessToken: () => token, renewSession });
    server = fakeConnectionsServer();
    server.refuseCreate = (req) => (req.bearer === "Bearer fresh" ? null : { status: 401, code: "session_expired" });
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Laptop");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));

    await waitFor(() => expect(openSheet("Your key")).not.toBeNull());
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(server.sent.filter((r) => r.method === "POST").map((r) => r.bearer)).toEqual([
      "Bearer stale",
      "Bearer fresh",
    ]);
    expect(server.issuedKeys).toHaveLength(1);
    expect(openSheet("Your key")?.querySelector("[data-connection-key]")).toHaveTextContent(server.issuedKeys[0]!);
  });

  it("shows the session's line when the session cannot be renewed", async () => {
    injectAuthHandlers({ getAccessToken: () => "stale", renewSession: async () => false });
    server = fakeConnectionsServer();
    server.refuseCreate = () => ({ status: 401, code: "session_expired" });
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Laptop");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your session has ended. Sign in again.");
    expect(server.sent.filter((r) => r.method === "POST")).toHaveLength(1);
  });
});

describe("the new key", () => {
  it("shows in the list as not used yet once the person has copied it", async () => {
    server = fakeConnectionsServer();
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "Claude Code on my laptop");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));

    const reveal = await screen.findByRole("dialog", { name: "Your key" });
    expect(reveal).toHaveTextContent("Copy it now. It is shown only once.");
    expect(reveal).toHaveTextContent(
      "If you lose the key before you use it, revoke this connection and connect again. That makes a new key.",
    );
    // Both setup tabs carry the real key.
    const key = server.issuedKeys[0]!;
    expect(reveal.querySelector("[data-snippet]")).toHaveTextContent(`Authorization: Bearer ${key}`);
    fireEvent.click(within(reveal).getByRole("radio", { name: "Claude Desktop" }));
    expect(reveal.querySelector("[data-snippet]")?.textContent).toContain(`"AUTH_HEADER": "Bearer ${key}"`);

    await confirmArmed();
    fireEvent.click(within(reveal).getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    expect(rowOf("Claude Code on my laptop")).toHaveTextContent("Not used yet");
    expect(rowOf("Claude Code on my laptop")).toHaveTextContent("Expires 19 December 2026");
  });

  it("leaves the list as it was while the reveal is up, then lists the new row and focuses it, with the list's own read still out", async () => {
    server = fakeConnectionsServer({ connections: [testConnection({ name: "Older" })] });
    renderSection();
    const dialog = await openCreate();
    fillCreate(dialog, "New one");
    // Every list read from now on hangs, as on a slow network.
    server.listGate = new Promise(() => {});
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    const reveal = await screen.findByRole("dialog", { name: "Your key" });
    const rowsBehind = (): (string | null)[] =>
      within(section())
        .getAllByRole("heading", { level: 3, hidden: true })
        .map((h) => h.textContent);
    expect(rowsBehind()).toEqual(["Older"]);
    await confirmArmed();
    expect(rowsBehind()).toEqual(["Older"]);

    fireEvent.click(within(reveal).getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(rowOf("New one")).toHaveFocus());
    expect(rowsBehind()).toEqual(["New one", "Older"]);
    expect(rowOf("New one")).toHaveTextContent("Not used yet");
    expect(rowOf("New one")).not.toHaveTextContent(server.issuedKeys[0]!);
  });

  describe("copying", () => {
    let writeText: jest.Mock<Promise<void>, [string]>;
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

    beforeEach(() => {
      writeText = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    });

    afterEach(() => {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    });

    it("names each Copy by what it copies, while each reads Copy", async () => {
      server = fakeConnectionsServer();
      renderSection();
      const reveal = await makeKey();
      const key = within(reveal).getByRole("button", { name: "Copy the key" });
      const command = within(reveal).getByRole("button", { name: "Copy the command" });
      expect(key).toHaveTextContent("Copy");
      expect(command).toHaveTextContent("Copy");
      fireEvent.click(within(reveal).getByRole("radio", { name: "Claude Desktop" }));
      expect(within(reveal).getByRole("button", { name: "Copy the entry" })).toHaveTextContent("Copy");
      expect(within(reveal).queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    });

    it("copies the key and says Copied, or selects it and says so in a live region when the browser refuses", async () => {
      server = fakeConnectionsServer();
      renderSection();
      const reveal = await makeKey();
      const key = server.issuedKeys[0]!;
      const copyKey = within(reveal).getByRole("button", { name: "Copy the key" });

      await act(async () => {
        fireEvent.click(copyKey);
      });
      expect(writeText).toHaveBeenCalledWith(key);
      expect(
        within(reveal)
          .getAllByRole("status")
          .some((s) => s.textContent === "Copied"),
      ).toBe(true);

      writeText.mockRejectedValue(new Error("denied"));
      await act(async () => {
        fireEvent.click(copyKey);
      });
      const line = within(reveal).getByText("Select the key and copy it.");
      expect(line.closest('[role="status"]')).toHaveAttribute("aria-live", "polite");
      expect(reveal.querySelector("[data-connection-key]")).toHaveFocus();
      expect(window.getSelection()?.toString()).toBe(key);
    });

    it("selects the command, not the key, when the command's Copy is refused, and says so in a live region", async () => {
      writeText.mockRejectedValue(new Error("denied"));
      server = fakeConnectionsServer();
      renderSection();
      const reveal = await makeKey();
      await act(async () => {
        fireEvent.click(within(reveal).getByRole("button", { name: "Copy the command" }));
      });
      const snippet = reveal.querySelector<HTMLElement>("[data-snippet]")!;
      expect(snippet).toHaveFocus();
      expect(window.getSelection()?.toString()).toBe(snippet.textContent);
      expect(window.getSelection()?.toString()).toContain("claude mcp add");
      const line = within(reveal).getByText("Select the text and copy it.");
      expect(line.closest('[role="status"]')).toHaveAttribute("aria-live", "polite");
    });

    it("says how to copy by hand when the browser has no clipboard at all", async () => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      server = fakeConnectionsServer();
      renderSection();
      const reveal = await makeKey();
      await act(async () => {
        fireEvent.click(within(reveal).getByRole("button", { name: "Copy the key" }));
      });
      expect(reveal).toHaveTextContent("Select the key and copy it.");
      expect(window.getSelection()?.toString()).toBe(server.issuedKeys[0]);
    });
  });
});
