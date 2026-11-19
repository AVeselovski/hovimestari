import { describe, expect, it } from "@jest/globals";
import { answerCache } from "../cache.js";

describe("answerCache", () => {
  it("serves an answer at 9 minutes and has dropped it at 10", () => {
    let t = 0;
    const cache = answerCache<string>({ ttlMs: 10 * 60_000, max: 500, now: () => t });
    cache.set("00000096385074", "not_found");
    t = 9 * 60_000;
    expect(cache.get("00000096385074")).toBe("not_found");
    t = 10 * 60_000;
    expect(cache.get("00000096385074")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("holds at most max answers, the oldest out first", () => {
    const cache = answerCache<number>({ ttlMs: 60_000, max: 2, now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 3);
    cache.set("c", 4);
    expect([cache.get("a"), cache.get("b"), cache.get("c")]).toEqual([3, undefined, 4]);
  });
});
