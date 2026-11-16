import type { Me } from "@hovimestari/types";
import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";
import { TEST_USER } from "../../__tests__/helpers/auth";
import { deferred, registerTestQueryClient } from "../../__tests__/helpers/queryClient";
import {
  afterAccountChange,
  afterFoodNameLanguageChange,
  afterTargetsChange,
  afterTimeZoneChange,
} from "../invalidation";
import { queryKeys } from "../queryKeys";

const OLD = "read before the write";
const NEW = "read after the write";
const written: Me = { ...TEST_USER, timeZone: "America/New_York" };

/**
 * A read of `key` that is still on its way, as the first read of an app start
 * is. The first answer is held until the test lets it go; every later read
 * answers at once.
 */
function readOnItsWay(client: QueryClient, key: QueryKey) {
  const first = deferred<string>();
  const fn = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue(NEW);
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fn, retry: false });
  const unsubscribe = observer.subscribe(() => {});
  return { first, fn, unsubscribe };
}

describe("a write that answers while a read from before it is still out", () => {
  const cases: [string, QueryKey, (client: QueryClient) => Promise<void>][] = [
    ["the time zone: today", queryKeys.targets(), (c) => afterTimeZoneChange(c, written)],
    ["a targets change: a date's targets", queryKeys.targetsOn("2026-11-20"), (c) => afterTargetsChange(c)],
    ["the food-name language: the foods", queryKeys.foods(), (c) => afterFoodNameLanguageChange(c, written)],
  ];

  it.each(cases)("%s are read again, and the old answer never lands", async (_name, key, write) => {
    const client = registerTestQueryClient(new QueryClient());
    const read = readOnItsWay(client, key);
    await write(client);
    read.first.resolve(OLD);
    await new Promise((r) => setTimeout(r, 0));
    expect(read.fn).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(key)).toBe(NEW);
    read.unsubscribe();
  });

  it.each([
    ["the time zone", (c: QueryClient) => afterTimeZoneChange(c, written)],
    ["the food-name language", (c: QueryClient) => afterFoodNameLanguageChange(c, written)],
    ["an account change", (c: QueryClient) => afterAccountChange(c, written)],
  ])(
    "%s: the account the write answered stays, and an account read from before it never overwrites it",
    async (_name, write) => {
      const client = registerTestQueryClient(new QueryClient());
      const first = deferred<Me>();
      const fn = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue(written);
      const observer = new QueryObserver(client, { queryKey: queryKeys.me(), queryFn: fn, retry: false });
      const unsubscribe = observer.subscribe(() => {});
      await write(client);
      expect(client.getQueryData(queryKeys.me())).toEqual(written);
      first.resolve(TEST_USER);
      await new Promise((r) => setTimeout(r, 0));
      expect(fn).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(queryKeys.me())).toEqual(written);
      unsubscribe();
    },
  );
});
