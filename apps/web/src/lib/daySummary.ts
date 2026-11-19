import type { Day, DaySummary } from "@hovimestari/types";

/**
 * A day's summary: the day without its entries, as `GET /days?from=&to=`
 * answers each day of a range. The one place that strips a day, so the cache
 * patch and the tests' fake server model the same summary.
 */
export function daySummaryOf(day: Day): DaySummary {
  const summary: Partial<Day> = { ...day };
  delete summary.entries;
  return summary as DaySummary;
}
