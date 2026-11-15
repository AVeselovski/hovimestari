import { poolStats } from "../db/index.js";

/** One line of pool occupancy and process memory. A pool with `waiting`
 *  above 0 for long stretches is the exhaustion signal. */
export function runtimeStatsLine(): string {
  const { total, idle, waiting } = poolStats();
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  return `[stats] pool total=${total} idle=${idle} waiting=${waiting} rss=${rssMb}MB`;
}

/** Logs `runtimeStatsLine()` on an interval. The timer is unref'd, so it
 *  never keeps the process alive on its own. */
export function startRuntimeStatsLog(intervalMs = 30_000, log: (line: string) => void = console.log): NodeJS.Timeout {
  return setInterval(() => log(runtimeStatsLine()), intervalMs).unref();
}
