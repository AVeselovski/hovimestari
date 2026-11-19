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

  it("forgets a key once its calls have all left the window, at the next sweep", () => {
    const window = createSlidingWindow(5, 1_000);
    window.admit("a", 0);
    window.admit("b", 400);
    expect(window.size()).toBe(2);
    // The sweep at 1 000 drops a, whose call at 0 has left the window, and keeps b.
    window.admit("c", 1_000);
    expect(window.size()).toBe(2);
    // b's call left the window at 1 400, and the next sweep is due at 2 000.
    window.admit("c", 1_400);
    expect(window.size()).toBe(2);
    window.admit("c", 2_000);
    expect(window.size()).toBe(1);
    expect(window.admit("a", 2_001)).toBe(true);
  });

  it("looks at the other books once a window, not on every call", () => {
    const window = createSlidingWindow(30, 60_000);
    window.admit("busy", 10_000); // a sweep, the first
    for (let user = 0; user < 1_000; user++) window.admit(`user ${user}`, 30_000);
    window.admit("busy", 70_000); // a sweep: every book still has a call in the window
    expect(window.size()).toBe(1_001);
    // From 90 000 every user's book is idle, and no sweep is due before 130 000.
    window.admit("busy", 100_000);
    expect(window.size()).toBe(1_001);
    // The next sweep empties the map of every idle book.
    window.admit("busy", 130_000);
    expect(window.size()).toBe(1);
  });
});
