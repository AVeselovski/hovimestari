import { TargetsSection } from "@/app/(app)/settings/_components/TargetsSection";
import { useAuth } from "@/contexts/AuthContext";
import { updateSettings } from "@/lib/api/settings";
import { getTargets, putTargets } from "@/lib/api/targets";
import { queryKeys } from "@/lib/queryKeys";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TEST_USER, fakeAuth } from "../../../__tests__/helpers/auth";
import { createTestQueryClient, deferred, queryWrapper } from "../../../__tests__/helpers/queryClient";
import { TargetsGate } from "../TargetsGate";
import { TODAY, change, overview, refusal } from "./support";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/settings", () => ({ updateSettings: jest.fn() }));

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getTargets).mockReset();
  jest.mocked(updateSettings).mockReset().mockResolvedValue(TEST_USER);
});

function renderGate(client: QueryClient = createTestQueryClient()) {
  render(
    <TargetsGate>
      <p>The tabs</p>
    </TargetsGate>,
    { wrapper: queryWrapper(client) },
  );
  return client;
}

const spinner = () => screen.queryByRole("status");
const firstRun = () => screen.queryByRole("heading", { name: "Your daily targets" });
const shell = () => screen.queryByText("The tabs");

describe("TargetsGate", () => {
  it("reads targets under a key with no date, so midnight never makes it pending again", async () => {
    jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
    const client = renderGate();
    await screen.findByText("The tabs");
    expect(queryKeys.targets()).toEqual(["targets"]);
    expect(client.getQueryCache().find({ queryKey: ["targets"], exact: true })).toBeDefined();
    expect(getTargets).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("shows the spinner while it has no answer and the read runs, and nothing else", () => {
    jest.mocked(getTargets).mockReturnValue(new Promise(() => {}));
    renderGate();
    expect(spinner()).toBeInTheDocument();
    expect(firstRun()).toBeNull();
    expect(shell()).toBeNull();
  });

  it("shows the first run for an account with no change", async () => {
    jest.mocked(getTargets).mockResolvedValue(overview([]));
    renderGate();
    expect(await screen.findByRole("heading", { name: "Your daily targets" })).toBeInTheDocument();
    expect(shell()).toBeNull();
  });

  it("shows the tabs for an account with one change", async () => {
    jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
    renderGate();
    expect(await screen.findByText("The tabs")).toBeInTheDocument();
    expect(firstRun()).toBeNull();
  });

  describe("offline at start", () => {
    afterEach(() => onlineManager.setOnline(true));

    it("shows the tabs, not the first run and not the spinner, while the read is paused", async () => {
      onlineManager.setOnline(false);
      jest.mocked(getTargets).mockResolvedValue(overview([]));
      const client = renderGate();
      await waitFor(() => expect(client.getQueryState(queryKeys.targets())?.fetchStatus).toBe("paused"));
      expect(shell()).toBeInTheDocument();
      expect(spinner()).toBeNull();
      expect(firstRun()).toBeNull();
      expect(getTargets).not.toHaveBeenCalled();
    });

    it("meets the first run at the first answer once the device is back online", async () => {
      onlineManager.setOnline(false);
      jest.mocked(getTargets).mockResolvedValue(overview([]));
      const answer = deferred<ReturnType<typeof overview>>();
      jest.mocked(getTargets).mockReturnValue(answer.promise);
      const client = renderGate();
      expect(shell()).toBeInTheDocument();
      act(() => onlineManager.setOnline(true));
      // The read runs with no answer yet: the tabs stay, no spinner takes their place.
      await waitFor(() => expect(getTargets).toHaveBeenCalled());
      expect(client.getQueryState(queryKeys.targets())?.fetchStatus).toBe("fetching");
      expect(spinner()).toBeNull();
      expect(shell()).toBeInTheDocument();
      await act(async () => answer.resolve(overview([])));
      expect(await screen.findByRole("heading", { name: "Your daily targets" })).toBeInTheDocument();
      expect(spinner()).toBeNull();
    });
  });

  it("shows the tabs, not the first run and not the spinner, when the server answers 503", async () => {
    jest.mocked(getTargets).mockRejectedValue(refusal(503, "server_unreachable"));
    const client = renderGate();
    await waitFor(() => expect(client.getQueryState(queryKeys.targets())?.status).toBe("error"));
    expect(shell()).toBeInTheDocument();
    expect(spinner()).toBeNull();
    expect(firstRun()).toBeNull();
  });

  it("does not read while the session is offline, and shows the tabs", () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline"));
    renderGate();
    expect(shell()).toBeInTheDocument();
    expect(getTargets).not.toHaveBeenCalled();
  });

  it("keeps the tabs, with no spinner, while the first read runs after an offline session turns signed in", async () => {
    jest.mocked(useAuth).mockReturnValue(fakeAuth("offline"));
    const answer = deferred<ReturnType<typeof overview>>();
    jest.mocked(getTargets).mockReturnValue(answer.promise);
    const client = createTestQueryClient();
    // A new element each time, so the rerender reaches the gate and it reads the session again.
    const tree = () => (
      <TargetsGate>
        <p>The tabs</p>
      </TargetsGate>
    );
    const { rerender } = render(tree(), { wrapper: queryWrapper(client) });
    expect(shell()).toBeInTheDocument();

    // The server answers again and the session is renewed.
    jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
    rerender(tree());
    await waitFor(() => expect(getTargets).toHaveBeenCalled());
    expect(client.getQueryState(queryKeys.targets())?.fetchStatus).toBe("fetching");
    expect(spinner()).toBeNull();
    expect(shell()).toBeInTheDocument();

    await act(async () => answer.resolve(overview([change(TODAY)])));
    expect(shell()).toBeInTheDocument();
  });

  it("keeps the tabs and an open sheet with typed input through a refetch, as at midnight", async () => {
    jest.mocked(getTargets).mockImplementation((date) => Promise.resolve(overview([change("2026-11-01")], date)));
    const client = createTestQueryClient();
    render(
      <TargetsGate>
        <TargetsSection />
      </TargetsGate>,
      { wrapper: queryWrapper(client) },
    );
    fireEvent.click(await screen.findByRole("button", { name: "Change targets" }));
    const dialog = await screen.findByRole("dialog");
    const from = within(within(dialog).getByRole("group", { name: "Calories" })).getByLabelText("From");
    fireEvent.change(from, { target: { value: "1900" } });

    // The day turns: the read runs again, and answers a new today.
    const next = deferred<ReturnType<typeof overview>>();
    jest.mocked(getTargets).mockReturnValue(next.promise);
    await act(async () => {
      void client.invalidateQueries({ queryKey: queryKeys.targets() });
    });
    await waitFor(() => expect(client.getQueryState(queryKeys.targets())?.fetchStatus).toBe("fetching"));
    expect(spinner()).toBeNull();
    expect(screen.getByRole("dialog")).toBe(dialog);
    await act(async () => next.resolve(overview([change("2026-11-01")], "2026-11-17", "2026-11-17")));

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(from).toBeInTheDocument();
    expect(from).toHaveValue("1900");
  });

  describe("the device's time zone", () => {
    const realFormat = Intl.DateTimeFormat;
    beforeEach(() => {
      jest.spyOn(Intl, "DateTimeFormat").mockImplementation(function deviceFormat(
        ...args: ConstructorParameters<typeof realFormat>
      ) {
        const real = new realFormat(...args);
        // Only the device's own format reports the unknown zone. A format
        // asked for a named zone (the day check's) is the runtime's own.
        if (args.length > 0) return real;
        return Object.assign(Object.create(real), {
          resolvedOptions: () => ({ ...real.resolvedOptions(), timeZone: "Mars/Olympus" }),
        });
      } as unknown as typeof Intl.DateTimeFormat);
    });
    afterEach(() => jest.restoreAllMocks());

    it("is sent once on start, and a refusal is dropped quietly, never shown", async () => {
      jest.mocked(updateSettings).mockRejectedValue(refusal(400, "invalid_time_zone"));
      jest.mocked(getTargets).mockResolvedValue(overview([change(TODAY)]));
      renderGate();
      expect(await screen.findByText("The tabs")).toBeInTheDocument();
      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ timeZone: "Mars/Olympus" }));
      await act(async () => {});
      expect(updateSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(document.body).not.toHaveTextContent(/went wrong|time zone|try again/i);
      expect(shell()).toBeInTheDocument();
    });

    it("reads today again after the zone is stored, even when the first read is still on its way", async () => {
      // The first read left before the zone was stored, so it answers the old today.
      const first = deferred<ReturnType<typeof overview>>();
      jest
        .mocked(getTargets)
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(overview([], "2026-11-17", "2026-11-17"));
      jest.mocked(updateSettings).mockResolvedValue({ ...TEST_USER, timeZone: "Mars/Olympus" });
      jest.mocked(putTargets).mockReset().mockResolvedValue(change("2026-11-17"));
      const client = renderGate();

      // The zone write answers first.
      await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
      await act(async () => {});
      // Then the read that left before it.
      await act(async () => first.resolve(overview([], TODAY, TODAY)));

      await waitFor(() => expect(getTargets).toHaveBeenCalledTimes(2), { timeout: 2000 });
      await waitFor(() => expect(client.getQueryData(queryKeys.targets())).toMatchObject({ today: "2026-11-17" }));

      // The first-run page saves on the new today.
      await screen.findByRole("heading", { name: "Your daily targets" });
      const bound = (g: string, b: string) => within(screen.getByRole("group", { name: g })).getByLabelText(b);
      fireEvent.change(bound("Calories", "From"), { target: { value: "1800" } });
      fireEvent.change(bound("Calories", "To"), { target: { value: "2200" } });
      fireEvent.change(bound("Protein", "From"), { target: { value: "120" } });
      fireEvent.change(bound("Protein", "To"), { target: { value: "160" } });
      fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
      await waitFor(() => expect(putTargets).toHaveBeenCalledWith("2026-11-17", expect.anything()));
    });
  });
});
