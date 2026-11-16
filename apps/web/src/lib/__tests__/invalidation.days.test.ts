import { dayOf, foodEntry } from "@/components/day/__tests__/support";
import { detailOf, fineliFood } from "@/components/foods/__tests__/support";
import type { Day, Me } from "@hovimestari/types";
import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";
import { TEST_USER } from "../../__tests__/helpers/auth";
import { deferred, registerTestQueryClient } from "../../__tests__/helpers/queryClient";
import {
  afterEntryWrite,
  afterFavourite,
  afterFoodGone,
  afterFoodNameLanguageChange,
  afterOwnFoodSaved,
  afterTargetsChange,
  afterTimeZoneChange,
  beginEntryWrite,
} from "../invalidation";
import { queryKeys } from "../queryKeys";

const written: Me = { ...TEST_USER, foodNameLanguage: "fi" };

/** A day read that is still on its way with an old answer, then answers anything later at once. */
function dayReadOnItsWay(client: QueryClient, date: string, later: Day) {
  const first = deferred<Day>();
  const fn = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue(later);
  const observer = new QueryObserver(client, { queryKey: queryKeys.day(date), queryFn: fn, retry: false });
  const unsubscribe = observer.subscribe(() => {});
  return { first, fn, unsubscribe };
}

/** A read under `key` with an observer, counting its fetches. */
function observed(client: QueryClient, key: QueryKey) {
  const fn = jest.fn().mockResolvedValue({ key });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fn, retry: false });
  const unsubscribe = observer.subscribe(() => {});
  return { fn, unsubscribe };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("afterEntryWrite and the app's today", () => {
  it("reads again an answered day whose today is older than the app's, and not one answered under today", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const old = observed(client, queryKeys.day("2026-11-15"));
    const current = observed(client, queryKeys.day("2026-11-14"));
    await tick();
    const reads = [old.fn.mock.calls.length, current.fn.mock.calls.length];
    const { settled } = await afterEntryWrite(
      client,
      [dayOf([], "2026-11-15", "2026-11-16"), dayOf([], "2026-11-14", "2026-11-17")],
      "2026-11-15",
      "2026-11-17",
    );
    await settled;
    expect(old.fn.mock.calls.length).toBe(reads[0] + 1);
    expect(current.fn.mock.calls.length).toBe(reads[1]);
    old.unsubscribe();
    current.unsubscribe();
  });
});

describe("beginEntryWrite", () => {
  it("reads a date again once the last of two overlapping writes on it settles, and never for one write alone", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const day = observed(client, queryKeys.day("2026-11-16"));
    await tick();
    const reads = () => day.fn.mock.calls.length;
    const start = reads();
    const alone = beginEntryWrite(client, ["2026-11-16"]);
    alone();
    await tick();
    expect(reads()).toBe(start);
    const first = beginEntryWrite(client, ["2026-11-16"]);
    const second = beginEntryWrite(client, ["2026-11-16", "2026-11-16"]);
    second();
    await tick();
    expect(reads()).toBe(start);
    first();
    first();
    await tick();
    expect(reads()).toBe(start + 1);
    day.unsubscribe();
  });
});

describe("afterEntryWrite", () => {
  it("puts every answered day under its own date, and a read from before the write never overwrites it", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const before = dayOf([foodEntry("Quark", 250, { status: "planned" })], "2026-11-16");
    const moved = dayOf([], "2026-11-16");
    const target = dayOf([foodEntry("Quark", 250, { status: "planned" })], "2026-11-18");
    const read = dayReadOnItsWay(client, "2026-11-16", moved);
    await afterEntryWrite(client, [moved, target], "2026-11-16");
    expect(client.getQueryData(queryKeys.day("2026-11-16"))).toBe(moved);
    expect(client.getQueryData(queryKeys.day("2026-11-18"))).toBe(target);
    read.first.resolve(before);
    await tick();
    expect(client.getQueryData(queryKeys.day("2026-11-16"))).toBe(moved);
    // The answered day is fresh: not read again.
    expect(read.fn).toHaveBeenCalledTimes(1);
    read.unsubscribe();
  });

  it("reads the shown day again when the answer holds none for it", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const shown = observed(client, queryKeys.day("2026-11-16"));
    await tick();
    const { settled } = await afterEntryWrite(client, [], "2026-11-16");
    await settled;
    expect(shown.fn).toHaveBeenCalledTimes(2);
    shown.unsubscribe();
  });

  it("refreshes the ranges, recent items, favourites and food details, not other days", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const reads = [
      queryKeys.dayRanges(),
      ["log", "recents"],
      queryKeys.foodFavourites(),
      queryKeys.foodDetail("x"),
    ].map((k) => observed(client, k));
    const otherDay = observed(client, queryKeys.day("2026-11-10"));
    await tick();
    const { settled } = await afterEntryWrite(client, [dayOf([], "2026-11-16")], "2026-11-16");
    await settled;
    for (const r of reads) expect(r.fn).toHaveBeenCalledTimes(2);
    expect(otherDay.fn).toHaveBeenCalledTimes(1);
  });
});

describe("the writes elsewhere that change what a day shows", () => {
  const food = detailOf(fineliFood("Rahka"), { source: "user", isOwn: true });
  it.each([
    ["an own food edited", (c: QueryClient) => afterOwnFoodSaved(c, food, "edited")],
    ["an own food renamed", (c: QueryClient) => afterOwnFoodSaved(c, food, "renamed")],
    ["an own food deleted", (c: QueryClient) => afterFoodGone(c, food.id)],
    ["a targets change", (c: QueryClient) => afterTargetsChange(c)],
    ["the time zone", (c: QueryClient) => afterTimeZoneChange(c, written)],
    ["the food-name language", (c: QueryClient) => afterFoodNameLanguageChange(c, written)],
  ])("%s reads every day again", async (_name, write) => {
    const client = registerTestQueryClient(new QueryClient());
    const day = observed(client, queryKeys.day("2026-11-16"));
    await tick();
    await write(client);
    await tick();
    expect(day.fn).toHaveBeenCalledTimes(2);
    day.unsubscribe();
  });

  it("a favourite tap reads no day again", async () => {
    const client = registerTestQueryClient(new QueryClient());
    const day = observed(client, queryKeys.day("2026-11-16"));
    await tick();
    await afterFavourite(client, food.id);
    await tick();
    expect(day.fn).toHaveBeenCalledTimes(1);
    day.unsubscribe();
  });
});
