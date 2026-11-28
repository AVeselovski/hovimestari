import { stubPhone } from "@/__tests__/formSheet";
import { TEST_USER, fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { fakeConnectionsServer, type FakeConnectionsServer } from "@/__tests__/helpers/connectionsServer";
import { createTestQueryClient, queryWrapper } from "@/__tests__/helpers/queryClient";
import { reactTreeHolds } from "@/__tests__/helpers/reactTree";
import { tap } from "@/__tests__/helpers/tap";
import { confirmArmed, controlSheetAnimations, openSheet, pressOutsideSheet, swipeSheetDown } from "@/__tests__/sheet";
import {
  ConnectionRevealProvider,
  useConnectionReveal,
  type ConnectionReveal,
} from "@/components/ConnectionRevealProvider";
import { useAuth } from "@/contexts/AuthContext";
import { injectAuthHandlers } from "@/lib/api";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import AppLayout from "../../layout";
import { ConnectedAiSection } from "../_components/ConnectedAiSection";

// ---------------------------------------------------------------------------
// The one-time key reveal (docs/design/connected-ai.md f.2). The key lives in
// `ConnectionRevealProvider` only. These tests check what must hold between
// states: the same key, in the same open sheet, across every accidental
// dismissal and across the section unmounting, and no key anywhere once the
// person confirms, signs out or another user signs in.
// ---------------------------------------------------------------------------

jest.mock("@/contexts/AuthContext");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/settings",
}));
// The layout's own gate and shell are beside the point here: they render their children.
jest.mock("@/components/targets/TargetsGate", () => ({
  TargetsGate: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

let server: FakeConnectionsServer;

beforeEach(() => {
  clockFrom("2026-11-19T10:00:00.000Z");
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  injectAuthHandlers({ getAccessToken: () => null, renewSession: async () => false });
  server = fakeConnectionsServer();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  server.restore();
  jest.restoreAllMocks();
});

/** Reads the store from inside the provider, for the tests that must see it empty. */
let storeNow: ConnectionReveal | null = null;
function StoreProbe(): null {
  storeNow = useConnectionReveal().reveal;
  return null;
}

/** Makes a read key through the create sheet, as a person would, and returns the reveal sheet. */
async function makeKey(name = "Claude Code on my laptop"): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole("button", { name: "Connect an assistant" }));
  const dialog = await screen.findByRole("dialog", { name: "Connect an assistant" });
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: name } });
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
  await waitFor(() => expect(openSheet("Your key")).not.toBeNull());
  return openSheet("Your key")!;
}

const keyShown = (sheet: HTMLElement): string | null | undefined =>
  sheet.querySelector("[data-connection-key]")?.textContent;

function renderSection(client: QueryClient = createTestQueryClient()): ReturnType<typeof render> {
  return render(
    <ConnectionRevealProvider>
      <StoreProbe />
      <ConnectedAiSection />
    </ConnectionRevealProvider>,
    { wrapper: queryWrapper(client) },
  );
}

describe("the key reveal", () => {
  it("closes the create sheet as it opens", async () => {
    renderSection();
    await makeKey();
    expect(openSheet("Connect an assistant")).toBeNull();
    expect(openSheet("Your key")).not.toBeNull();
  });

  it("stays open with the same key after Escape, a press outside and a swipe", async () => {
    renderSection();
    const sheet = await makeKey();
    const key = server.issuedKeys[0]!;
    expect(keyShown(sheet)).toBe(key);
    await confirmArmed();

    fireEvent.keyDown(document.activeElement ?? sheet, { key: "Escape" });
    await act(async () => {});
    expect(openSheet("Your key")).toBe(sheet);
    expect(keyShown(sheet)).toBe(key);

    pressOutsideSheet();
    await act(async () => {});
    expect(openSheet("Your key")).toBe(sheet);
    expect(keyShown(sheet)).toBe(key);

    swipeSheetDown(sheet);
    await act(async () => {});
    expect(openSheet("Your key")).toBe(sheet);
    expect(keyShown(sheet)).toBe(key);
    expect(storeNow?.key).toBe(key);
  });

  it("opens again with the same key when the section mounts again", async () => {
    const client = createTestQueryClient();
    function Page({ shown }: { shown: boolean }): ReactNode {
      return shown ? <ConnectedAiSection /> : null;
    }
    const { rerender } = render(
      <ConnectionRevealProvider>
        <Page shown />
      </ConnectionRevealProvider>,
      { wrapper: queryWrapper(client) },
    );
    await makeKey();
    const key = server.issuedKeys[0]!;

    // Android's second back leaves Settings: the section and its sheet unmount.
    rerender(
      <ConnectionRevealProvider>
        <Page shown={false} />
      </ConnectionRevealProvider>,
    );
    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    expect(document.body).not.toHaveTextContent(key);

    rerender(
      <ConnectionRevealProvider>
        <Page shown />
      </ConnectionRevealProvider>,
    );
    await waitFor(() => expect(openSheet("Your key")).not.toBeNull());
    expect(keyShown(openSheet("Your key")!)).toBe(key);
  });

  it("is gone after I have copied it: from the store, both caches, the page and storage", async () => {
    const client = createTestQueryClient();
    renderSection(client);
    const sheet = await makeKey();
    const key = server.issuedKeys[0]!;
    await confirmArmed();
    fireEvent.click(within(sheet).getByRole("button", { name: "I have copied it" }));

    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    expect(storeNow).toBeNull();
    await waitFor(() => expect(document.body.innerHTML).not.toContain(key));
    await waitFor(() => expect(client.getMutationCache().getAll()).toEqual([]));
    const queries = JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.state),
    );
    expect(queries).toContain("Claude Code on my laptop");
    expect(queries).not.toContain(key);
    expect(JSON.stringify({ ...localStorage })).not.toContain(key);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(key);
    expect(window.location.href).not.toContain(key);
  });

  it("leaves no component holding the key once the reveal has slid out", async () => {
    const { container } = renderSection();
    const sheet = await makeKey();
    const key = server.issuedKeys[0]!;
    // The check sees the key while it is held, so its silence afterwards means something.
    expect(reactTreeHolds(container, key)).toBe(true);
    await confirmArmed();
    fireEvent.click(within(sheet).getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    await waitFor(() => expect(reactTreeHolds(container, key)).toBe(false));
  });

  it("keeps the key out of both caches while it is shown", async () => {
    const client = createTestQueryClient();
    renderSection(client);
    await makeKey();
    const key = server.issuedKeys[0]!;
    await waitFor(() => expect(client.getMutationCache().getAll()).toEqual([]));
    const caches = JSON.stringify([
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.state),
      client
        .getMutationCache()
        .getAll()
        .map((m) => m.state),
    ]);
    expect(caches).not.toContain(key);
  });

  it("moves focus to the new row once the person has copied it", async () => {
    renderSection();
    const sheet = await makeKey("Claude Desktop at home");
    await confirmArmed();
    fireEvent.click(within(sheet).getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    const row = await screen.findByRole("listitem", { name: "Claude Desktop at home" });
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("moves focus from I have copied it straight to the new row, in the press's own update, with no stop on the way", async () => {
    renderSection();
    const sheet = await makeKey("Straight there");
    await confirmArmed();
    const done = within(sheet).getByRole("button", { name: "I have copied it" });
    done.focus();
    const stops: string[] = [];
    const record = (e: FocusEvent): void => {
      const el = e.target as HTMLElement;
      stops.push(el.getAttribute("aria-label") ?? el.textContent ?? el.tagName);
    };
    document.addEventListener("focusin", record);
    try {
      fireEvent.click(done);
      // The row is listed and focused by the time the press's update has run: no timer, no later read.
      const row = screen.getByRole("listitem", { name: "Straight there" });
      expect(row).toHaveFocus();
      await waitFor(() => expect(openSheet("Your key")).toBeNull());
      expect(row).toHaveFocus();
      expect(stops).toEqual([row.textContent]);
    } finally {
      document.removeEventListener("focusin", record);
    }
  });

  it("brings the new row into view only once the page behind is let go, so the scroll it puts back cannot undo it", async () => {
    // The page's one scroll container, as in the app shell.
    const main = document.body.appendChild(document.createElement("main"));
    const calls: { el: Element; overflow: string; arg: unknown }[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      calls.push({ el: this, overflow: main.style.overflow, arg });
    };
    try {
      render(
        <ConnectionRevealProvider>
          <ConnectedAiSection />
        </ConnectionRevealProvider>,
        { container: main, wrapper: queryWrapper(createTestQueryClient()) },
      );
      const sheet = await makeKey("Into view");
      expect(main.style.overflow).toBe("hidden");
      await confirmArmed();
      fireEvent.click(within(sheet).getByRole("button", { name: "I have copied it" }));
      const row = await screen.findByRole("listitem", { name: "Into view" });
      await waitFor(() => expect(row).toHaveFocus());
      const onRow = calls.filter((c) => c.el === row);
      expect(onRow).toEqual([{ el: row, overflow: "", arg: { block: "nearest" } }]);
    } finally {
      Element.prototype.scrollIntoView = original;
      main.remove();
    }
  });

  it("moves focus to the new row once it is listed, when Settings came back before its list", async () => {
    const client = createTestQueryClient();
    function Page({ shown }: { shown: boolean }): ReactNode {
      return shown ? <ConnectedAiSection /> : null;
    }
    const tree = (shown: boolean): ReactNode => (
      <ConnectionRevealProvider>
        <Page shown={shown} />
      </ConnectionRevealProvider>
    );
    const { rerender } = render(tree(true), { wrapper: queryWrapper(client) });
    await makeKey("Late row");
    rerender(tree(false));
    await waitFor(() => expect(openSheet("Your key")).toBeNull());

    // Settings mounts again with the key still held, and a cache with no list yet.
    client.clear();
    let release = (): void => {};
    server.listGate = new Promise((resolve) => {
      release = resolve;
    });
    rerender(tree(true));
    await waitFor(() => expect(openSheet("Your key")).not.toBeNull());
    await confirmArmed();
    fireEvent.click(within(openSheet("Your key")!).getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    expect(screen.queryByRole("listitem", { name: "Late row" })).toBeNull();

    server.listGate = null;
    await act(async () => release());
    const row = await screen.findByRole("listitem", { name: "Late row" });
    await waitFor(() => expect(row).toHaveFocus());
  });
});

describe("on a phone", () => {
  it("I have copied it ignores a press until the reveal is at rest, so a double tap on Create key keeps the key", async () => {
    const desktop = stubPhone();
    const animations = controlSheetAnimations();
    try {
      renderSection();
      const sheet = await makeKey();
      const done = within(sheet).getByRole("button", { name: "I have copied it" });
      // The second tap of a double tap on Create key lands here while the reveal slides in.
      tap(done);
      await act(async () => {});
      expect(openSheet("Your key")).toBe(sheet);
      expect(storeNow?.key).toBe(server.issuedKeys[0]);

      await waitFor(() => {
        animations.finish();
        expect(sheet.querySelector("[data-armed]")).not.toBeNull();
      });
      tap(done);
      await waitFor(() => expect(storeNow).toBeNull());
    } finally {
      animations.restore();
      desktop();
    }
  });
});

describe("the reveal in the signed-in layout", () => {
  function signedInAs(id: string, status: "authenticated" | "unauthenticated" = "authenticated"): void {
    jest
      .mocked(useAuth)
      .mockReturnValue(fakeAuth(status, status === "authenticated" ? { user: { ...TEST_USER, id } } : {}));
  }

  function app(): ReactNode {
    return (
      <AppLayout>
        <StoreProbe />
        <ConnectedAiSection />
      </AppLayout>
    );
  }

  it("leaves no key after sign-out and signing in again", async () => {
    signedInAs(TEST_USER.id);
    const { rerender } = render(app());
    await makeKey();
    const key = server.issuedKeys[0]!;
    expect(storeNow?.key).toBe(key);

    signedInAs(TEST_USER.id, "unauthenticated");
    rerender(app());
    await waitFor(() => expect(openSheet("Your key")).toBeNull());

    storeNow = null;
    signedInAs(TEST_USER.id);
    rerender(app());
    await screen.findByRole("button", { name: "Connect an assistant" });
    expect(storeNow).toBeNull();
    expect(openSheet("Your key")).toBeNull();
    expect(document.body.innerHTML).not.toContain(key);
  });

  it("leaves no key when another user signs in", async () => {
    signedInAs(TEST_USER.id);
    const { rerender } = render(app());
    await makeKey();
    const key = server.issuedKeys[0]!;

    signedInAs("5f0c2a1e-1111-4a2b-9c3d-000000000002");
    rerender(app());
    await screen.findByRole("button", { name: "Connect an assistant" });
    await waitFor(() => expect(openSheet("Your key")).toBeNull());
    expect(storeNow).toBeNull();
    expect(document.body.innerHTML).not.toContain(key);
  });
});
