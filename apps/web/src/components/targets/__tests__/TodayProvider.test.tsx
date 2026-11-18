import { TEST_USER, fakeAuth } from "@/__tests__/helpers/auth";
import { createTestQueryClient, queryWrapper, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { TargetsSection } from "@/app/(app)/settings/_components/TargetsSection";
import { dayOf } from "@/components/day/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { useToday } from "@/hooks/useToday";
import { getDay } from "@/lib/api/days";
import { getTargets } from "@/lib/api/targets";
import { afterDayChange, afterTimeZoneChange } from "@/lib/invalidation";
import { formatDay, todayIn } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import { dayQuery } from "@/lib/queryOptions";
import { onlineManager, useQuery, type QueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { ASK_INTERVAL_MS, TICK_MS, TodayProvider } from "../TodayProvider";
import { change, overview, refusal } from "./support";

jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/targets", () => ({ getTargets: jest.fn(), putTargets: jest.fn(), deleteTargets: jest.fn() }));
jest.mock("@/lib/api/days", () => ({ getDay: jest.fn() }));
jest.mock("@/lib/invalidation", () => {
  const actual = jest.requireActual<typeof import("@/lib/invalidation")>("@/lib/invalidation");
  return { ...actual, afterDayChange: jest.fn(actual.afterDayChange) };
});
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/settings",
}));

const HELSINKI_MIDNIGHT = Date.parse("2026-11-16T22:00:00Z");
const MINUTE = 60_000;

/** The server's own clock runs `offset` behind or ahead of the device's. Its today is in Helsinki. */
function serverAt(offsetMs: number): void {
  jest.mocked(getTargets).mockImplementation(async () => {
    const today = todayIn("Europe/Helsinki", Date.now() + offsetMs);
    return overview([change("2026-11-01"), change("2026-11-17", [2000, 2400])], today, today);
  });
}

function Probe(): ReactElement {
  const { today, holding, confirm, unconfirmed } = useToday();
  return (
    <p data-testid="today">
      {today ?? "none"} {holding ? "holding" : "free"} {confirm} {unconfirmed ? "unconfirmed" : "confirmed"}
    </p>
  );
}
const probe = () => screen.getByTestId("today").textContent;

function seeded(today: string): QueryClient {
  const client = registerTestQueryClient(createTestQueryClient());
  client.setQueryData(
    queryKeys.targets(),
    overview([change("2026-11-01"), change("2026-11-17", [2000, 2400])], today, today),
  );
  return client;
}

function renderProvider(client: QueryClient, extra?: ReactElement) {
  return render(
    <TodayProvider>
      <Probe />
      {extra}
    </TodayProvider>,
    { wrapper: queryWrapper(client) },
  );
}

const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

const dayChange = jest.mocked(afterDayChange);
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  jest.mocked(getTargets).mockReset();
  jest.mocked(getDay).mockReset();
  dayChange.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

describe("TodayProvider", () => {
  it("with the device 5 minutes ahead, asks once at its midnight, then no sooner than 5 minutes, and moves within 5 minutes of the server's", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 2 * MINUTE);
    serverAt(-5 * MINUTE);
    renderProvider(seeded("2026-11-16"));
    const asks: number[] = [];
    jest.mocked(getTargets).mockImplementation(async () => {
      asks.push(Date.now());
      const today = todayIn("Europe/Helsinki", Date.now() - 5 * MINUTE);
      return overview([change("2026-11-01")], today, today);
    });
    // Device 23:59, then 00:00: the one ask, answered with the old date, which stands.
    await advance(2 * TICK_MS);
    expect(asks).toEqual([HELSINKI_MIDNIGHT]);
    expect(probe()).toBe("2026-11-16 free fresh confirmed");
    // 00:01 to 00:04: the ticks compare and send nothing.
    await advance(4 * TICK_MS);
    expect(asks).toHaveLength(1);
    // 00:05, the server's 00:00: asked again, and the date moves once.
    await advance(TICK_MS);
    expect(asks).toEqual([HELSINKI_MIDNIGHT, HELSINKI_MIDNIGHT + ASK_INTERVAL_MS]);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
    expect(dayChange).toHaveBeenCalledTimes(1);
    await advance(10 * TICK_MS);
    expect(asks).toHaveLength(2);
    for (let i = 1; i < asks.length; i++) expect(asks[i] - asks[i - 1]).toBeGreaterThanOrEqual(ASK_INTERVAL_MS);
  });

  it("moves today when a write's answer carries a newer one, with no device check", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 10 * MINUTE);
    const client = seeded("2026-11-16");
    renderProvider(client);
    act(() => client.setQueryData(queryKeys.day("2026-11-17"), dayOf([], "2026-11-17", "2026-11-17")));
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
    await advance(0);
    expect(dayChange).toHaveBeenCalledTimes(1);
    expect(getTargets).not.toHaveBeenCalled();
  });

  it("with a slow device clock, moves today on a day read after the server's midnight, and asks nothing", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 3 * MINUTE);
    jest.mocked(getDay).mockImplementation(async (date) => dayOf([], date, "2026-11-17"));
    const client = seeded("2026-11-16");
    function ReadsTomorrow(): null {
      useQuery(dayQuery("2026-11-17"));
      return null;
    }
    renderProvider(client, <ReadsTomorrow />);
    await advance(0);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
    await advance(2 * TICK_MS);
    expect(getTargets).not.toHaveBeenCalled();
    expect(dayChange).toHaveBeenCalledTimes(1);
  });

  it("pauses the ask offline at midnight without holding, and asks at once on reconnect", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    serverAt(0);
    renderProvider(seeded("2026-11-16"));
    act(() => onlineManager.setOnline(false));
    await advance(TICK_MS);
    expect(probe()).toBe("2026-11-16 free paused unconfirmed");
    expect(getTargets).not.toHaveBeenCalled();
    act(() => {
      onlineManager.setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await advance(0);
    expect(getTargets).toHaveBeenCalledTimes(1);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
  });

  it("after a 503 holds nothing, keeps the last today, and asks again on the next trigger", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    serverAt(0);
    jest.mocked(getTargets).mockRejectedValueOnce(refusal(503, "request_refused"));
    renderProvider(seeded("2026-11-16"));
    await advance(TICK_MS);
    expect(probe()).toBe("2026-11-16 free failed unconfirmed");
    await advance(ASK_INTERVAL_MS);
    expect(getTargets).toHaveBeenCalledTimes(2);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
  });

  it("after a failed ask, asks again at once when the connection returns, without waiting 5 minutes", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    serverAt(0);
    jest.mocked(getTargets).mockRejectedValueOnce(refusal(503, "request_refused"));
    renderProvider(seeded("2026-11-16"));
    await advance(TICK_MS);
    expect(probe()).toBe("2026-11-16 free failed unconfirmed");
    act(() => void window.dispatchEvent(new Event("online")));
    await advance(0);
    expect(getTargets).toHaveBeenCalledTimes(2);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
  });

  it("holds writes only while an ask is in flight", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    let answer: (v: Awaited<ReturnType<typeof getTargets>>) => void = () => {};
    jest.mocked(getTargets).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderProvider(seeded("2026-11-16"));
    await advance(TICK_MS);
    expect(probe()).toBe("2026-11-16 holding checking confirmed");
    await act(async () => answer(overview([change("2026-11-01")], "2026-11-17", "2026-11-17")));
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
  });

  it("takes an earlier today after a westward time zone change, and Settings follows it", async () => {
    // 05:00 on 17 Nov in Helsinki is 22:00 on 16 Nov in New York.
    jest.setSystemTime(Date.parse("2026-11-17T03:00:00Z"));
    const client = seeded("2026-11-17");
    client.setQueryData(queryKeys.me(), TEST_USER);
    jest
      .mocked(getTargets)
      .mockResolvedValue(
        overview([change("2026-11-01"), change("2026-11-17", [2000, 2400])], "2026-11-16", "2026-11-16"),
      );
    renderProvider(client, <TargetsSection />);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
    await act(async () => afterTimeZoneChange(client, { ...TEST_USER, timeZone: "America/New_York" }));
    await advance(0);
    expect(probe()).toBe("2026-11-16 free fresh confirmed");
    // Settings reads the same today: the change from 17 Nov is still to come.
    expect(screen.getByText(`From ${formatDay("2026-11-17")}`)).toBeInTheDocument();
    // A later answer in the same zone still moves only forward.
    act(() => client.setQueryData(queryKeys.day("2026-11-15"), dayOf([], "2026-11-15", "2026-11-15")));
    expect(probe()).toBe("2026-11-16 free fresh confirmed");
  });

  it("never moves back for an older today arriving after a newer one in the same zone", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT + 10 * MINUTE);
    const client = seeded("2026-11-16");
    renderProvider(client);
    act(() => client.setQueryData(queryKeys.day("2026-11-17"), dayOf([], "2026-11-17", "2026-11-17")));
    expect(probe()).toMatch(/^2026-11-17/);
    act(() => client.setQueryData(queryKeys.targets(), overview([change("2026-11-01")], "2026-11-16", "2026-11-16")));
    act(() => client.setQueryData(queryKeys.day("2026-11-16"), dayOf([], "2026-11-16", "2026-11-16")));
    expect(probe()).toMatch(/^2026-11-17/);
  });

  it("ends an ask as paused when the device goes offline while it is out, so writes are not held", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    // No answer while offline, as a paused retry gives none.
    let answer: (v: Awaited<ReturnType<typeof getTargets>>) => void = () => {};
    jest.mocked(getTargets).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderProvider(seeded("2026-11-16"));
    await advance(TICK_MS);
    expect(probe()).toBe("2026-11-16 holding checking confirmed");
    act(() => onlineManager.setOnline(false));
    expect(probe()).toBe("2026-11-16 free paused unconfirmed");
    // Back online, the ask goes again at once, and the read answers.
    act(() => {
      onlineManager.setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => answer(overview([change("2026-11-01")], "2026-11-17", "2026-11-17")));
    await advance(0);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
  });

  it("keeps the day confirmed while a later ask is out, with a device clock hours ahead", async () => {
    // The device is 3 hours ahead: its date is past the server's all that time.
    jest.setSystemTime(HELSINKI_MIDNIGHT + MINUTE);
    serverAt(-3 * 60 * MINUTE);
    renderProvider(seeded("2026-11-16"));
    await advance(0);
    expect(probe()).toBe("2026-11-16 free fresh confirmed");
    let answer: (v: Awaited<ReturnType<typeof getTargets>>) => void = () => {};
    jest.mocked(getTargets).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await advance(ASK_INTERVAL_MS);
    expect(probe()).toBe("2026-11-16 holding checking confirmed");
    await act(async () => answer(overview([change("2026-11-01")], "2026-11-16", "2026-11-16")));
    expect(probe()).toBe("2026-11-16 free fresh confirmed");
  });

  it("asks once at midnight and moves once under StrictMode", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    serverAt(0);
    render(
      <StrictMode>
        <TodayProvider>
          <Probe />
        </TodayProvider>
      </StrictMode>,
      { wrapper: queryWrapper(seeded("2026-11-16")) },
    );
    await advance(TICK_MS);
    await advance(0);
    expect(probe()).toBe("2026-11-17 free fresh confirmed");
    expect(getTargets).toHaveBeenCalledTimes(1);
    expect(dayChange).toHaveBeenCalledTimes(1);
  });

  it("brings Settings' current targets to the new date after midnight", async () => {
    jest.setSystemTime(HELSINKI_MIDNIGHT - 30_000);
    serverAt(0);
    renderProvider(seeded("2026-11-16"), <TargetsSection />);
    expect(screen.getByText(`From ${formatDay("2026-11-17")}`)).toBeInTheDocument();
    await advance(TICK_MS);
    await advance(0);
    expect(probe()).toMatch(/^2026-11-17/);
    await advance(100);
    expect(screen.queryByText(`From ${formatDay("2026-11-17")}`)).toBeNull();
    const current = `Current (from ${formatDay("2026-11-17")})`;
    expect(screen.getByRole("button", { name: (name) => name.startsWith(current) })).toHaveTextContent(
      "2000 to 2400 kcal",
    );
  });
});

describe("todayIn", () => {
  it("reads the instant in the account's zone, and a zone the runtime does not know as Helsinki, as the server does", () => {
    const at = Date.parse("2026-11-16T22:30:00Z");
    expect(todayIn("Europe/Helsinki", at)).toBe("2026-11-17");
    expect(todayIn("America/New_York", at)).toBe("2026-11-16");
    expect(todayIn("Mars/Olympus", at)).toBe("2026-11-17");
  });
});
