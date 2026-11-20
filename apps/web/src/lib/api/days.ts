import { api, type RequestOptions } from "@/lib/api";
import { averageOfDays, type Day, type DaysAverage, type DaySummaryList, type IsoDate } from "@hovimestari/types";

/** `GET /days/:date`: one day with its entries, both readings and their positions. Always a concrete date. */
export async function getDay(date: IsoDate, req?: RequestOptions): Promise<Day> {
  const res = await api.get<Day>(`/days/${date}`, { signal: req?.signal });
  return res.data;
}

/** The range's answer as it may arrive: a backend deployed before the average answers `{ days }` alone. */
type RangeAnswer = Omit<DaySummaryList, "average"> & { average?: DaysAverage };

/**
 * `GET /days?from=&to=`: every day of the range, both ends included, without
 * their entries, and their average day. At most 42 days. When the backend
 * does not answer the average, it is `averageOfDays` of the same days: the
 * one shared computation, so the figure is the one the server would give.
 */
export async function getDaySummaries(from: IsoDate, to: IsoDate, req?: RequestOptions): Promise<DaySummaryList> {
  const res = await api.get<RangeAnswer>("/days", { params: { from, to }, signal: req?.signal });
  const { days, average } = res.data;
  return { days, average: average ?? averageOfDays(days) };
}
