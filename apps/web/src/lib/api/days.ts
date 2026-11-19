import { api, type RequestOptions } from "@/lib/api";
import type { Day, DaySummaryList, IsoDate } from "@hovimestari/types";

/** `GET /days/:date`: one day with its entries, both readings and their positions. Always a concrete date. */
export async function getDay(date: IsoDate, req?: RequestOptions): Promise<Day> {
  const res = await api.get<Day>(`/days/${date}`, { signal: req?.signal });
  return res.data;
}

/** `GET /days?from=&to=`: every day of the range, both ends included, without their entries. At most 42 days. */
export async function getDaySummaries(from: IsoDate, to: IsoDate, req?: RequestOptions): Promise<DaySummaryList> {
  const res = await api.get<DaySummaryList>("/days", { params: { from, to }, signal: req?.signal });
  return res.data;
}
