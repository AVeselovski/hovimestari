import { dayOf, foodEntry } from "@/components/day/__tests__/support";
import { api } from "@/lib/api";
import { daySummaryOf } from "@/lib/daySummary";
import { averageOfDays, type DaySummary } from "@hovimestari/types";
import { getDaySummaries } from "../days";

// `GET /days` answers `{ days, average }`. The web and the backend deploy on
// their own, so a web build can meet a backend that does not answer
// `average` yet. `getDaySummaries` then answers the average the server would
// give: `averageOfDays` of the same days, the one shared computation.

jest.mock("@/lib/api", () => ({ api: { get: jest.fn() } }));

const TODAY = "2026-11-20";

/** Tuesday eaten, Wednesday empty, today with a plan: both averages count days. */
function week(): DaySummary[] {
  return [
    daySummaryOf(dayOf([foodEntry("Rahka", 250, { date: "2026-11-17" })], "2026-11-17", TODAY)),
    daySummaryOf(dayOf([], "2026-11-18", TODAY)),
    daySummaryOf(dayOf([foodEntry("Rahka", 400, { date: TODAY, status: "planned" })], TODAY, TODAY)),
  ];
}

beforeEach(() => jest.mocked(api.get).mockReset());

describe("getDaySummaries", () => {
  it("answers averageOfDays of the days when the server's answer has no average", async () => {
    const days = week();
    jest.mocked(api.get).mockResolvedValue({ data: { days } });

    const answer = await getDaySummaries("2026-11-17", TODAY);

    expect(answer.days).toBe(days);
    expect(answer.average).toEqual(averageOfDays(days));
    expect(answer.average.eaten.dates).toEqual(["2026-11-17"]);
    expect(answer.average.withPlan.dates).toEqual(["2026-11-17", TODAY]);
  });

  it("answers the server's own average unchanged when it has one", async () => {
    const days = week();
    const average = averageOfDays(days);
    jest.mocked(api.get).mockResolvedValue({ data: { days, average } });

    const answer = await getDaySummaries("2026-11-17", TODAY);

    expect(answer.average).toBe(average);
  });

  it("asks for the range with the caller's signal", async () => {
    jest.mocked(api.get).mockResolvedValue({ data: { days: [], average: averageOfDays([]) } });
    const signal = new AbortController().signal;
    await getDaySummaries("2026-11-16", "2026-11-22", { signal });
    expect(api.get).toHaveBeenCalledWith("/days", { params: { from: "2026-11-16", to: "2026-11-22" }, signal });
  });
});
