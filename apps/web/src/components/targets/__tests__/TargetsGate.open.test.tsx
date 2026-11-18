import { useAuth } from "@/contexts/AuthContext";
import { updateSettings } from "@/lib/api/settings";
import { getTargets, putTargets } from "@/lib/api/targets";
import { finishFirstRun } from "@/lib/api/users";
import { queryKeys } from "@/lib/queryKeys";
import { targetsQuery } from "@/lib/queryOptions";
import { QueryObserver, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactElement } from "react";
import { TEST_USER, fakeAuth } from "../../../__tests__/helpers/auth";
import { createTestQueryClient, deferred, queryWrapper } from "../../../__tests__/helpers/queryClient";
import { TargetsGate, useFirstRun } from "../TargetsGate";
import { TODAY, change, overview } from "./support";

// What a press of Set targets does when the targets read cannot answer at
// once: offline, slow, or overtaken by a navigation. The page opens from the
// cache's word or not at all, at the press, and never later by itself. And an
// entry marked open for a user who has a change loses its mark.

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

afterEach(() => {
  act(() => onlineManager.setOnline(true));
  jest.useRealTimers();
});

const firstRun = () => screen.queryByRole("heading", { name: "Your daily targets" });
const shell = () => screen.queryByText("The tabs");

/**
 * A stand-in for the shell: a button that asks for the first-run page, a
 * log of what the gate hands back on each mount, and a way to mount it again
 * (as a later visit to the Day tab does).
 */
const mounts = jest.fn<void, [boolean]>();
function DayStandIn(): ReactElement {
  const firstRunPage = useFirstRun();
  useEffect(() => {
    mounts(firstRunPage.takeReturned());
  }, [firstRunPage]);
  return (
    <button type="button" onClick={() => void firstRunPage.open()}>
      Set targets
    </button>
  );
}
function Shell(): ReactElement {
  const [visit, setVisit] = useState(0);
  return (
    <>
      <p>The tabs</p>
      {/* The Day tab lives on the root address only, as in the app. */}
      {window.location.pathname === "/" && <DayStandIn key={visit} />}
      <button type="button" onClick={() => setVisit((n) => n + 1)}>
        Visit the day again
      </button>
    </>
  );
}

function renderGate() {
  mounts.mockReset();
  const client = createTestQueryClient();
  const { unmount } = render(
    <TargetsGate>
      <Shell />
    </TargetsGate>,
    { wrapper: queryWrapper(client) },
  );
  return { client, unmount };
}

async function traverse(delta: -1 | 1): Promise<void> {
  const moved = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
  await act(async () => {
    window.history.go(delta);
    await moved;
  });
}

/** Runs `press`, which goes Back, and waits for its popstate. */
async function traverseBy(press: () => void): Promise<void> {
  const moved = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
  await act(async () => {
    press();
    await moved;
  });
}

/** Lets every pending promise and timer-free effect run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
}

describe("TargetsGate, Set targets while the read cannot answer", () => {
  it("opens the page at once from the cache while the device is offline", async () => {
    renderGate();
    await screen.findByText("The tabs");
    const calls = jest.mocked(getTargets).mock.calls.length;
    const before = window.history.length;
    act(() => onlineManager.setOnline(false));
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await settle();
    expect(firstRun()).toBeInTheDocument();
    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toEqual({ fromNext: true, firstRun: true });
    // Nothing was sent: offline, the cache's word stands.
    expect(getTargets).toHaveBeenCalledTimes(calls);
    // The connection comes back, and the server holds a change by now: the page the person is on stays.
    jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
    const back = jest.spyOn(window.history, "back");
    act(() => onlineManager.setOnline(true));
    await settle();
    expect(back).not.toHaveBeenCalled();
    expect(firstRun()).toBeInTheDocument();
    back.mockRestore();
  });

  it("opens nothing and adds no entry when the connection comes back after the page closed", async () => {
    renderGate();
    await screen.findByText("The tabs");
    act(() => onlineManager.setOnline(false));
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await settle();
    expect(firstRun()).toBeInTheDocument();
    await traverse(-1);
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    // Somewhere else by now.
    window.history.pushState({ fromNext: true }, "", "/settings");
    const length = window.history.length;
    act(() => onlineManager.setOnline(true));
    await settle();
    expect(firstRun()).toBeNull();
    expect(window.history.length).toBe(length);
    expect(window.history.state).toEqual({ fromNext: true });
    expect(window.location.pathname).toBe("/settings");
  });

  it("opens at the press while the read is slow, and an answer with no change leaves it open", async () => {
    renderGate();
    await screen.findByText("The tabs");
    const read = deferred<ReturnType<typeof overview>>();
    const calls = jest.mocked(getTargets).mock.calls.length;
    jest.mocked(getTargets).mockImplementation(() => read.promise);
    const push = jest.spyOn(window.history, "pushState");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    });
    // On screen in the press's own update, before the read has answered.
    expect(firstRun()).toBeInTheDocument();
    expect(getTargets).toHaveBeenCalledTimes(calls + 1);
    await act(async () => read.resolve(overview([])));
    await settle();
    expect(firstRun()).toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it("a late answer with a change, after the page was left and the user moved on, moves nothing", async () => {
    renderGate();
    await screen.findByText("The tabs");
    const read = deferred<ReturnType<typeof overview>>();
    const calls = jest.mocked(getTargets).mock.calls.length;
    jest.mocked(getTargets).mockImplementation(() => read.promise);
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await screen.findByRole("heading", { name: "Your daily targets" });
    expect(getTargets).toHaveBeenCalledTimes(calls + 1);
    await traverse(-1);
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    window.history.pushState({ fromNext: true }, "", "/settings");
    const back = jest.spyOn(window.history, "back");
    await act(async () => read.resolve(overview([change(TODAY)])));
    await settle();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/settings");
    expect(window.history.state).toEqual({ fromNext: true });
    // The day took its return once, when Back reached it.
    expect(mounts.mock.calls).toEqual([[false], [true]]);
    back.mockRestore();
  });

  it("does nothing after the read when the gate has gone, such as after signing out", async () => {
    const { client, unmount } = renderGate();
    await screen.findByText("The tabs");
    // Something outside the gate still watches the targets read, so the
    // gate's unmount does not cancel it and it answers after the gate is gone.
    const watcher = new QueryObserver(client, targetsQuery());
    const stopWatching = watcher.subscribe(() => {});
    await settle();
    const read = deferred<ReturnType<typeof overview>>();
    const calls = jest.mocked(getTargets).mock.calls.length;
    jest.mocked(getTargets).mockImplementation(() => read.promise);
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await screen.findByRole("heading", { name: "Your daily targets" });
    // The press's own read is the one out, and it has not answered.
    expect(getTargets).toHaveBeenCalledTimes(calls + 1);
    unmount();
    const back = jest.spyOn(window.history, "back");
    await act(async () => read.resolve(overview([change(TODAY)])));
    await settle();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
    stopWatching();
  });
});

describe("TargetsGate, one Back per opening", () => {
  it("goes Back once when Continue and a read that finds a change both land", async () => {
    window.history.replaceState({ fromNext: true }, "", "/settings");
    window.history.pushState({ fromNext: true }, "", ADDRESS);
    const { client } = renderGate();
    await screen.findByText("The tabs");
    const read = deferred<ReturnType<typeof overview>>();
    jest.mocked(getTargets).mockImplementation(() => read.promise);
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await screen.findByRole("heading", { name: "Your daily targets" });
    const back = jest.spyOn(window.history, "back");
    const moved = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
    await act(async () => {
      // Continue goes Back, and before its popstate arrives the read answers a change.
      fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
      read.resolve(overview([change(TODAY)]));
      await moved;
    });
    await settle();
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe(ADDRESS);
    expect(shell()).toBeInTheDocument();
    back.mockRestore();
    // The next opening goes Back again: the latch was for the last one only.
    jest.mocked(getTargets).mockResolvedValue(overview([]));
    act(() => client.setQueryData(queryKeys.targets(), overview([])));
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    await screen.findByRole("heading", { name: "Your daily targets" });
    await traverseBy(() => fireEvent.click(screen.getByRole("button", { name: "Continue without targets" })));
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
  });
});

describe("TargetsGate, arriving on the tabs from the self-shown first run", () => {
  it("hands the Day tab a return on the address it was passed on, and only there", async () => {
    let due = true;
    jest.mocked(getTargets).mockImplementation(async () => overview([], TODAY, TODAY, { firstRunDue: due }));
    jest.mocked(finishFirstRun).mockImplementation(async () => {
      due = false;
    });
    renderGate();
    await screen.findByRole("heading", { name: "Your daily targets" });
    fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    expect(mounts.mock.calls).toEqual([[true]]);
    // Taken once: a later visit gets none.
    fireEvent.click(screen.getByRole("button", { name: "Visit the day again" }));
    expect(mounts.mock.calls).toEqual([[true], [false]]);
  });

  it("hands nothing to a Day tab on another address than the one it was passed on", async () => {
    window.history.replaceState({ fromNext: true }, "", "/settings");
    let due = true;
    jest.mocked(getTargets).mockImplementation(async () => overview([], TODAY, TODAY, { firstRunDue: due }));
    jest.mocked(finishFirstRun).mockImplementation(async () => {
      due = false;
    });
    renderGate();
    await screen.findByRole("heading", { name: "Your daily targets" });
    fireEvent.click(screen.getByRole("button", { name: "Continue without targets" }));
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    // No Day tab on /settings, so the return waits there, for that address only.
    expect(mounts).not.toHaveBeenCalled();
    window.history.pushState({ fromNext: true }, "", ADDRESS);
    fireEvent.click(screen.getByRole("button", { name: "Visit the day again" }));
    expect(mounts.mock.calls).toEqual([[false]]);
  });
});

describe("TargetsGate, an entry marked open for a user who has a change", () => {
  it("loses its mark, keeping the router's own state, so a removal later opens nothing by itself", async () => {
    window.history.pushState({ fromNext: true, firstRun: true }, "", ADDRESS);
    jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
    const length = window.history.length;
    const { client } = renderGate();
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    await waitFor(() => expect(window.history.state).toEqual({ fromNext: true }), { timeout: 1000 });
    expect(window.history.length).toBe(length);
    expect(window.location.pathname + window.location.search).toBe(ADDRESS);
    // Another device removes the only change, and the targets are read again.
    jest.mocked(getTargets).mockResolvedValue(overview([]));
    await act(async () => {
      await client.invalidateQueries();
    });
    await settle();
    expect(firstRun()).toBeNull();
    expect(shell()).toBeInTheDocument();
    // And Set targets on that entry is a live press.
    fireEvent.click(screen.getByRole("button", { name: "Set targets" }));
    expect(await screen.findByRole("heading", { name: "Your daily targets" })).toBeInTheDocument();
    expect(window.history.length).toBe(length + 1);
  });
});
