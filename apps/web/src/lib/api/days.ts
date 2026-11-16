import { api, type RequestOptions } from "@/lib/api";
import type { Day, IsoDate } from "@hovimestari/types";

/** `GET /days/:date`: one day with its entries, both readings and their positions. Always a concrete date. */
export async function getDay(date: IsoDate, req?: RequestOptions): Promise<Day> {
  const res = await api.get<Day>(`/days/${date}`, { signal: req?.signal });
  return res.data;
}
