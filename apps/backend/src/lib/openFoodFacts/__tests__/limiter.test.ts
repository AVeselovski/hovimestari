import { describe, expect, it } from "@jest/globals";
import { keyedBuckets, SWEEP_EVERY_MS, tokenBucket } from "../limiter.js";

// On a fake clock: each test owns its time.

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe("tokenBucket", () => {
  it("refuses the eleventh call in a minute and has refilled a minute later", () => {
    const c = clock();
    const server = tokenBucket({ capacity: 10, refillEveryMs: 6_000, now: c.now });
    for (let i = 0; i < 10; i++) {
      expect(server.has()).toBe(true);
      server.take();
    }
    expect(server.has()).toBe(false);
    c.advance(5_999);
    expect(server.has()).toBe(false);
    c.advance(1);
    expect(server.has()).toBe(true);
    c.advance(60_000);
    for (let i = 0; i < 10; i++) server.take();
    expect(server.has()).toBe(false);
  });
});

describe("keyedBuckets", () => {
  it("refuses one user's 31st call in an hour while another user still gets through", () => {
    const c = clock();
    const users = keyedBuckets({ capacity: 30, refillEveryMs: 120_000, now: c.now });
    for (let i = 0; i < 30; i++) {
      expect(users.has("a")).toBe(true);
      users.take("a");
    }
    expect(users.has("a")).toBe(false);
    expect(users.has("b")).toBe(true);
    c.advance(120_000);
    expect(users.has("a")).toBe(true);
  });

  it("drops a bucket that has refilled to full on the next sweep, so only the taker is left", () => {
    const c = clock();
    const users = keyedBuckets({ capacity: 30, refillEveryMs: 120_000, now: c.now });
    users.take("a");
    users.take("b");
    expect(users.size()).toBe(2);
    c.advance(120_000 + SWEEP_EVERY_MS);
    users.take("c");
    expect(users.size()).toBe(1);
  });

  it("sweeps at most once a minute", () => {
    const c = clock();
    const users = keyedBuckets({ capacity: 1, refillEveryMs: 1_000, now: c.now });
    c.advance(SWEEP_EVERY_MS);
    users.take("a");
    c.advance(1_000);
    users.take("b");
    // a is full again, but the last sweep was a second ago.
    expect(users.size()).toBe(2);
    c.advance(SWEEP_EVERY_MS);
    users.take("c");
    expect(users.size()).toBe(1);
  });
});
