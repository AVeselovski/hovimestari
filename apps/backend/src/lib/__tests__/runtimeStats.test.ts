import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("../../db/index.js", () => ({
  poolStats: () => ({ total: 5, idle: 2, waiting: 3 }),
}));

const { runtimeStatsLine, startRuntimeStatsLog } = await import("../runtimeStats.js");

afterEach(() => {
  jest.useRealTimers();
});

describe("runtimeStatsLine", () => {
  it("reports pool occupancy and resident memory", () => {
    expect(runtimeStatsLine()).toMatch(/^\[stats\] pool total=5 idle=2 waiting=3 rss=\d+MB$/);
  });
});

describe("startRuntimeStatsLog", () => {
  it("logs once per interval on a timer that does not keep the process alive", () => {
    jest.useFakeTimers();
    const log = jest.fn<(line: string) => void>();

    const timer = startRuntimeStatsLog(30_000, log);
    try {
      expect(timer.hasRef()).toBe(false);
      jest.advanceTimersByTime(29_999);
      expect(log).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      jest.advanceTimersByTime(30_000);
      expect(log).toHaveBeenCalledTimes(2);
      expect(log.mock.calls[0][0]).toMatch(/^\[stats\] pool total=5 idle=2 waiting=3/);
    } finally {
      clearInterval(timer);
    }
  });
});
