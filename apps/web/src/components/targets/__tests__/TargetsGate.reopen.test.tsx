import { useAuth } from "@/contexts/AuthContext";
import { updateSettings } from "@/lib/api/settings";
import { getTargets, putTargets } from "@/lib/api/targets";
import { finishFirstRun } from "@/lib/api/users";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";
import { TEST_USER, fakeAuth } from "../../../__tests__/helpers/auth";
import { createTestQueryClient, deferred, queryWrapper } from "../../../__tests__/helpers/queryClient";
import { TargetsGate, useFirstRun } from "../TargetsGate";
import { TODAY, change, overview, refusal } from "./support";

// The first-run page as the gate shows it: by itself while the first run is
// due, and again on request from a user with no targets. The reopened page
// is one history entry on the same address, so Back, Forward and a reload
// mean what they say.

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/settings", () => ({ updateSettings: jest.fn() }));
jest.mock("@/lib/api/users", () => ({ getMe: jest.fn(), deleteAccount: jest.fn(), finishFirstRun: jest.fn() }));

const ADDRESS = "/?date=2026-11-10";

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getTargets).mockReset().mockResolvedValue(overview([]));
  jest.mocked(putTargets).mockReset().mockResolvedValue(change(TODAY));
  jest.mocked(finishFirstRun).mockReset().mockResolvedValue(undefined);
  jest.mocked(updateSettings).mockReset().mockResolvedValue(TEST_USER);
  window.history.replaceState({ fromNext: true }, "", ADDRESS);
});

const firstRun = () => screen.queryByRole("heading", { name: "Your daily targets" });
const shell = () => screen.queryByText("The tabs");

/** A stand-in for the Day tab: a button that asks for the first-run page, and a log of what the gate hands back. */
const mounts = jest.fn<void, [boolean]>();
function Shell(): ReactElement {
  const firstRunPage = useFirstRun();
  useEffect(() => {
    mounts(firstRunPage.takeReturned());
    // Only on mount, as the Day tab reads it.
  }, [firstRunPage]);
  return (
    <>
      <p>The tabs</p>
      <button type="button" onClick={() => void firstRunPage.open()}>
        Set targets
      </button>
    </>
  );
}

function renderGate() {
  mounts.mockReset();
  const client = createTestQueryClient();
  render(
    <TargetsGate>
      <Shell />
    </TargetsGate>,
    { wrapper: queryWrapper(client) },
  );
  return client;
}

/** The browser's Back or Forward, with the popstate it fires. */
async function traverse(delta: -1 | 1): Promise<void> {
  const moved = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
  await act(async () => {
    window.history.go(delta);
    await moved;
  });
}

async function openFromShell(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Set targets" }));
  await screen.findByRole("heading", { name: "Your daily targets" });
}

function fillAll(): void {
  const bound = (g: string, b: string) => within(screen.getByRole("group", { name: g })).getByLabelText(b);
  fireEvent.change(bound("Calories", "From"), { target: { value: "1800" } });
  fireEvent.change(bound("Calories", "To"), { target: { value: "2200" } });
  fireEvent.change(bound("Protein", "From"), { target: { value: "120" } });
  fireEvent.change(bound("Protein", "To"), { target: { value: "160" } });
}

describe("TargetsGate, the first run", () => {
  it("never shows the first run to a user with no targets who has passed it", async () => {
    jest.mocked(getTargets).mockResolvedValue(overview([], TODAY, TODAY, { firstRunDue: false }));
    renderGate();
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    await act(async () => {});
    expect(firstRun()).toBeNull();
  });

  it("goes on without targets from the self-shown page: it records the first run, never goes Back, and the tabs show on the same address", async () => {
    // The server's rule: due until the first run is recorded.
    let due = true;
    jest.mocked(getTargets).mockImplementation(async () => overview([], TODAY, TODAY, { firstRunDue: due }));
    jest.mocked(finishFirstRun).mockImplementation(async () => {
      due = false;
    });
    const back = jest.spyOn(window.history, "back");
    const go = jest.spyOn(window.history, "go");
    renderGate();
    await screen.findByRole("heading", { name: "Your daily targets" });
    fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
    await waitFor(() => expect(finishFirstRun).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(ADDRESS);
    back.mockRestore();
    go.mockRestore();
  });

  it("keeps the self-shown page with the refusal when recording the first run fails, and unlocks it", async () => {
    jest.mocked(getTargets).mockResolvedValue(overview([], TODAY, TODAY, { firstRunDue: true }));
    jest.mocked(finishFirstRun).mockRejectedValueOnce(refusal(503, "server_unreachable"));
    renderGate();
    await screen.findByRole("heading", { name: "Your daily targets" });
    const go = screen.getByRole("button", { name: "Continue without targets" });
    fireEvent.click(go);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Hovimestari cannot be reached right now."),
    );
    expect(firstRun()).toBeInTheDocument();
    expect(go).toBeEnabled();
    expect(go).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save targets" })).toBeEnabled();
  });

  describe("opened again from the shell", () => {
    it("opens as one history entry on the same address, keeping the router's own state, with no request to record anything", async () => {
      renderGate();
      const before = window.history.length;
      await openFromShell();
      expect(shell()).toBeNull();
      expect(window.history.length).toBe(before + 1);
      expect(window.history.state).toEqual({ fromNext: true, firstRun: true });
      expect(window.location.pathname + window.location.search).toBe(ADDRESS);
      expect(finishFirstRun).not.toHaveBeenCalled();
    });

    it("opens at once, reads the targets behind it, and goes Back to the tabs when the user turns out to have a change", async () => {
      renderGate();
      await screen.findByText("The tabs");
      const calls = jest.mocked(getTargets).mock.calls.length;
      // Another device has saved targets since the cache was filled. The answer waits for the test.
      const read = deferred<ReturnType<typeof overview>>();
      jest.mocked(getTargets).mockImplementation(() => read.promise);
      const before = window.history.length;
      fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
      expect(await screen.findByRole("heading", { name: "Your daily targets" })).toBeInTheDocument();
      expect(getTargets).toHaveBeenCalledTimes(calls + 1);
      const moved = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
      await act(async () => {
        read.resolve(overview([change(TODAY)]));
        await moved;
      });
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
      expect(firstRun()).toBeNull();
      expect(window.history.state).toEqual({ fromNext: true });
      expect(window.location.pathname + window.location.search).toBe(ADDRESS);
      // Back, as Continue goes: the entry it pushed is ahead now, and the day takes the return.
      expect(window.history.length).toBe(before + 1);
      expect(mounts.mock.calls).toEqual([[false], [true]]);
    });

    it("opens once for two presses in a row", async () => {
      renderGate();
      const read = deferred<ReturnType<typeof overview>>();
      await screen.findByText("The tabs");
      const calls = jest.mocked(getTargets).mock.calls.length;
      jest.mocked(getTargets).mockImplementation(() => read.promise);
      const push = jest.spyOn(window.history, "pushState");
      const button = screen.getByRole("button", { name: "Set targets" });
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      await screen.findByRole("heading", { name: "Your daily targets" });
      await act(async () => read.resolve(overview([])));
      expect(push).toHaveBeenCalledTimes(1);
      expect(getTargets).toHaveBeenCalledTimes(calls + 1);
      expect(firstRun()).toBeInTheDocument();
      push.mockRestore();
    });

    it("Continue goes Back to the shell on the same address, and hands back the return once", async () => {
      renderGate();
      await openFromShell();
      const moved = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
        await moved;
      });
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
      expect(window.location.pathname + window.location.search).toBe(ADDRESS);
      expect(window.history.state).toEqual({ fromNext: true });
      expect(finishFirstRun).not.toHaveBeenCalled();
      // The first mount saw no return, the mount after the page saw one.
      expect(mounts.mock.calls).toEqual([[false], [true]]);
    });

    it("the browser's Back closes it, and Forward opens it again", async () => {
      renderGate();
      await openFromShell();
      await traverse(-1);
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
      expect(firstRun()).toBeNull();
      await traverse(1);
      expect(await screen.findByRole("heading", { name: "Your daily targets" })).toBeInTheDocument();
      expect(shell()).toBeNull();
      await traverse(-1);
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
    });

    it("shows again after a reload while it is open, and Back still closes it", async () => {
      // A reload keeps the entry's state: the page reads it as it mounts.
      window.history.replaceState({ fromNext: true }, "", ADDRESS);
      window.history.pushState({ fromNext: true, firstRun: true }, "", ADDRESS);
      renderGate();
      expect(await screen.findByRole("heading", { name: "Your daily targets" })).toBeInTheDocument();
      expect(shell()).toBeNull();
      await traverse(-1);
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
    });

    it("a successful Save goes Back to the shell", async () => {
      jest.mocked(getTargets).mockResolvedValue(overview([]));
      renderGate();
      await openFromShell();
      jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
      fillAll();
      const moved = new Promise((r) => window.addEventListener("popstate", r, { once: true }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
        await moved;
      });
      expect(putTargets).toHaveBeenCalledWith(TODAY, expect.anything());
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
      expect(window.location.pathname + window.location.search).toBe(ADDRESS);
      expect(mounts.mock.calls).toEqual([[false], [true]]);
    });

    it("a refused Save stays on the page with its refusal", async () => {
      jest.mocked(putTargets).mockRejectedValueOnce(refusal(400, "target_value_invalid"));
      const back = jest.spyOn(window.history, "back");
      renderGate();
      await openFromShell();
      fillAll();
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("A number is too large or has more than one decimal."),
      );
      expect(firstRun()).toBeInTheDocument();
      expect(back).not.toHaveBeenCalled();
      back.mockRestore();
    });

    it("shows the tabs, not the page, on an entry marked open for a user who has a change", async () => {
      window.history.pushState({ fromNext: true, firstRun: true }, "", ADDRESS);
      jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
      renderGate();
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
      await act(async () => {});
      expect(firstRun()).toBeNull();
    });
  });
});
