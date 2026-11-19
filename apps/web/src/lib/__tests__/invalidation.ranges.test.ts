import { dayOf, foodEntry } from "@/components/day/__tests__/support";
import type { Day, DaySummary, DaySummaryList } from "@hovimestari/types";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { TEST_USER } from "../../__tests__/helpers/auth";
import { deferred, registerTestQueryClient } from "../../__tests__/helpers/queryClient";
import { daySummaryOf } from "../daySummary";
import { afterEntryWrite, afterTimeZoneChange, putDaysInRanges, zoneEpoch } from "../invalidation";
import { queryKeys } from "../queryKeys";

// ---------------------------------------------------------------------------
// An entry write puts each day it answers into every cached range at once, so
// the week never shows a day's old figures while the range's read is out.
// ---------------------------------------------------------------------------

const FROM = "2026-11-16";
const TO = "2026-11-22";
const DATE = "2026-11-18";

/** A week of empty days, as the server answers it before the write. */
function emptyWeek(): DaySummaryList {
  const days: DaySummary[] = [];
  for (let d = 16; d <= 22; d += 1) days.push(daySummaryOf(dayOf([], `2026-11-${d}`, DATE)));
  return { days };
}

/** The day the write answers: one entry on DATE. */
function written(): Day {
  return dayOf([foodEntry("Rahka", 250, { date: DATE })], DATE, DATE);
}

/** The range's row for DATE in the cache. */
function rowIn(client: QueryClient, from = FROM, to = TO): DaySummary | undefined {
  return client.getQueryData<DaySummaryList>(queryKeys.dayRange(from, to))?.days.find((d) => d.date === DATE);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** An observed range whose reads answer, in order, what `answers` holds, and then never answer. */
function observedRange(client: QueryClient, answers: Promise<DaySummaryList>[], from = FROM, to = TO) {
  const fn = jest.fn();
  for (const answer of answers) fn.mockReturnValueOnce(answer);
  fn.mockReturnValue(new Promise(() => {}));
  const observer = new QueryObserver(client, { queryKey: queryKeys.dayRange(from, to), queryFn: fn, retry: false });
  const unsubscribe = observer.subscribe(() => {});
  return { fn, unsubscribe };
}

describe("an entry write and the cached ranges", () => {
  it("puts the answered day into a cached range before any read of the range answers", async () => {
    const client = registerTestQueryClient(new QueryClient());
    client.setQueryData(queryKeys.dayRange(FROM, TO), emptyWeek());
    // Every read of the range from here on stays out.
    const range = observedRange(client, []);
    await tick();

    await afterEntryWrite(client, [written()], DATE);

    expect(rowIn(client)).toEqual(daySummaryOf(written()));
    expect(rowIn(client)).not.toHaveProperty("entries");
    range.unsubscribe();
  });

  it("keeps the answered day in a range whose read was out when the write answered", async () => {
    const client = registerTestQueryClient(new QueryClient());
    client.setQueryData(queryKeys.dayRange(FROM, TO), emptyWeek());
    // The range is being read again when the write answers. That read left
    // before the write was stored, so it answers the old week.
    const old = deferred<DaySummaryList>();
    const range = observedRange(client, [old.promise]);
    void client.refetchQueries({ queryKey: queryKeys.dayRange(FROM, TO) });
    await tick();
    expect(client.getQueryState(queryKeys.dayRange(FROM, TO))?.fetchStatus).toBe("fetching");

    const { settled } = await afterEntryWrite(client, [written()], DATE);
    old.resolve(emptyWeek());
    await tick();
    await tick();

    expect(rowIn(client)).toEqual(daySummaryOf(written()));
    void settled;
    range.unsubscribe();
  });

  it("keeps the answered day in an unobserved range whose read was out when the write answered", async () => {
    const client = registerTestQueryClient(new QueryClient());
    client.setQueryData(queryKeys.dayRange(FROM, TO), emptyWeek());
    // A week read ahead: nothing observes it, so the refresh after the write
    // does not read it again. Its read left before the write was stored.
    const old = deferred<DaySummaryList>();
    void client.prefetchQuery({ queryKey: queryKeys.dayRange(FROM, TO), queryFn: () => old.promise, staleTime: 0 });
    await tick();
    expect(client.getQueryState(queryKeys.dayRange(FROM, TO))?.fetchStatus).toBe("fetching");

    await afterEntryWrite(client, [written()], DATE);
    old.resolve(emptyWeek());
    await tick();
    await tick();

    expect(rowIn(client)).toEqual(daySummaryOf(written()));
  });

  it("aborts a range read that is out before it writes into the range", async () => {
    const client = registerTestQueryClient(new QueryClient());
    client.setQueryData(queryKeys.dayRange(FROM, TO), emptyWeek());
    let signal: AbortSignal | undefined;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.dayRange(FROM, TO),
      queryFn: (context) => {
        signal = context.signal;
        return new Promise<DaySummaryList>(() => {});
      },
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    await tick();
    expect(signal?.aborted).toBe(false);

    await putDaysInRanges(client, [written()]);

    expect(signal?.aborted).toBe(true);
    expect(rowIn(client)).toEqual(daySummaryOf(written()));
    unsubscribe();
  });

  it("writes into every cached range that holds the date and leaves the others as they were", async () => {
    const client = registerTestQueryClient(new QueryClient());
    client.setQueryData(queryKeys.dayRange(FROM, TO), emptyWeek());
    const fortnight = { days: [...emptyWeek().days, daySummaryOf(dayOf([], "2026-11-23", DATE))] };
    client.setQueryData(queryKeys.dayRange(FROM, "2026-11-23"), fortnight);
    const later = { days: [daySummaryOf(dayOf([], "2026-11-30", DATE))] };
    client.setQueryData(queryKeys.dayRange("2026-11-30", "2026-11-30"), later);

    await putDaysInRanges(client, [written()]);

    expect(rowIn(client)).toEqual(daySummaryOf(written()));
    expect(rowIn(client, FROM, "2026-11-23")).toEqual(daySummaryOf(written()));
    expect(client.getQueryData(queryKeys.dayRange("2026-11-30", "2026-11-30"))).toBe(later);
  });

  it("leaves a range with no data without data", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const first = deferred<DaySummaryList>();
    const range = observedRange(client, [first.promise]);
    await tick();

    await afterEntryWrite(client, [written()], DATE);

    expect(client.getQueryData(queryKeys.dayRange(FROM, TO))).toBeUndefined();
    range.unsubscribe();
  });

  it("changes no range with days answered in the account's old time zone", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const week = emptyWeek();
    client.setQueryData(queryKeys.dayRange(FROM, TO), week);
    const sentIn = zoneEpoch(client);
    await afterTimeZoneChange(client, TEST_USER);

    await afterEntryWrite(client, [written()], DATE, undefined, sentIn);

    expect(client.getQueryData(queryKeys.dayRange(FROM, TO))).toBe(week);
  });
});
