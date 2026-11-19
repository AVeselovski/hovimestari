import { describe, expect, it } from "@jest/globals";
import { CHANGES_PER_HOUR, createSlidingWindow, HOUR_MS, WRITES_PER_MINUTE, writesPerMinute } from "../writeBrake.js";

// Lifted from finanssiappisV2's writeBrake.test.ts. The window itself, on
// plain numbers for the clock. writeBrakes.db.test.ts drives both brakes
// through the tools, shared by two keys of one person.

describe("the brakes' numbers", () => {
  it("are the design's: 30 write calls a minute and 300 changes an hour, per person", () => {
    expect([WRITES_PER_MINUTE, CHANGES_PER_HOUR, HOUR_MS]).toEqual([30, 300, 3_600_000]);
  });

  it("admit 30 calls in a minute on the process's own window, and refuse the 31st", () => {
    writesPerMinute.reset();
    for (let i = 0; i < 30; i++) expect(writesPerMinute.admit("user", 1_000 + i)).toBe(true);
    expect(writesPerMinute.admit("user", 60_999)).toBe(false);
    // The first call, at 1 000, leaves the window at 61 000.
    expect(writesPerMinute.admit("user", 61_000)).toBe(true);
    writesPerMinute.reset();
  });
});

describe("createSlidingWindow", () => {
  it("admits up to the limit in a window, then refuses until the oldest call leaves it", () => {
    const window = createSlidingWindow(2, 1_000);
    expect(window.admit("a", 0)).toBe(true);
    expect(window.admit("a", 500)).toBe(true);
    expect(window.admit("a", 999)).toBe(false);
    // The call at 0 has left the window; the call at 500 has not.
    expect(window.admit("a", 1_000)).toBe(true);
    expect(window.admit("a", 1_001)).toBe(false);
  });

  it("does not count a refused call", () => {
    const window = createSlidingWindow(1, 1_000);
    expect(window.admit("a", 0)).toBe(true);
    for (let at = 1; at < 1_000; at += 100) expect(window.admit("a", at)).toBe(false);
    expect(window.admit("a", 1_000)).toBe(true);
  });

  it("keeps separate books per key, and forgets them on reset", () => {
    const window = createSlidingWindow(1, 1_000);
    expect(window.admit("a", 0)).toBe(true);
    expect(window.admit("b", 0)).toBe(true);
    expect(window.admit("a", 1)).toBe(false);
    window.reset();
    expect(window.admit("a", 2)).toBe(true);
  });

  it("forgets a key once its calls have all left the window", () => {
    const window = createSlidingWindow(5, 1_000);
    window.admit("a", 0);
    window.admit("b", 400);
    expect(window.size()).toBe(2);
    // At 1 000 the call at 0 has left the window and the call at 400 has not.
    window.admit("c", 1_000);
    expect(window.size()).toBe(2);
    // Neither a nor b calls again: their books go anyway.
    window.admit("c", 1_400);
    expect(window.size()).toBe(1);
    expect(window.admit("a", 1_401)).toBe(true);
  });
});
